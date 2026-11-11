"""Download engines (yt-dlp, gallery-dl) updated from Settings without a new app release.

Sites change often and break downloads until these libraries catch up, so a newer copy can be
pip-installed into a per-user folder, one subfolder per engine. At start-up that subfolder goes in
front of ``sys.path``, but only while its copy is newer than the one bundled with the app: an app
update that ships an even newer engine makes the downloaded copy inert without any cleanup.

The engines are imported when the app starts, so a new copy takes effect after a restart.
"""

import importlib
import importlib.metadata
import json
import os
import re
import shutil
import sys
import time
import traceback
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from backend.core.paths import app_data_dir

# Lets tests and manual checks point the app at a scratch folder.
ENGINES_DIR_ENV = "MEDIASTUDIO_ENGINES_DIR"
CHECK_FLAG = "--check-engines"
PYPI_URL = "https://pypi.org/pypi/{}/json"
CHECK_INTERVAL_S = 24 * 3600


@dataclass(frozen=True)
class Engine:
    id: str  # PyPI name
    module: str
    # Packages the engine pins to an exact version and that must be installed with it.
    companions: Tuple[str, ...] = ()
    # Imported by the verification process: what the app itself uses.
    probe_modules: Tuple[str, ...] = ()


ENGINES: Tuple[Engine, ...] = (
    Engine(
        "yt-dlp",
        "yt_dlp",
        companions=("yt-dlp-ejs",),
        probe_modules=(
            "yt_dlp.extractor.tiktok",
            "yt_dlp.extractor.instagram",
            "yt_dlp.networking",
            # Raises when the new yt-dlp no longer supports the bundled curl_cffi (TikTok needs it).
            "yt_dlp.networking._curlcffi",
            "yt_dlp.utils",
        ),
    ),
    Engine(
        "gallery-dl",
        "gallery_dl",
        probe_modules=("gallery_dl.config", "gallery_dl.exception", "gallery_dl.extractor.instagram"),
    ),
)

# Version of each engine this process imported, recorded by activate_engines().
_in_use: Dict[str, str] = {}


def get_engine(engine_id: str) -> Engine:
    for engine in ENGINES:
        if engine.id == engine_id:
            return engine
    raise ValueError(f"Unknown engine: {engine_id}")


def engines_dir() -> Path:
    override = os.environ.get(ENGINES_DIR_ENV)
    if override:
        return Path(override)
    return app_data_dir() / "engines" / f"cp{sys.version_info.major}{sys.version_info.minor}"


def engine_dir(engine_id: str) -> Path:
    return engines_dir() / engine_id


def staging_dir(engine_id: str) -> Path:
    return engines_dir() / f"{engine_id}.new"


def version_tuple(version: Optional[str]) -> Tuple[int, ...]:
    """``2026.08.19`` and ``2026.8.19`` compare equal; anything unparsable sorts first."""
    if not version:
        return ()
    return tuple(int(part) for part in re.findall(r"\d+", version.split("+")[0]))


def is_newer(candidate: Optional[str], than: Optional[str]) -> bool:
    return bool(candidate) and version_tuple(candidate) > version_tuple(than)


def _dist_version(name: str, paths: Sequence[str]) -> Optional[str]:
    for dist in importlib.metadata.distributions(name=name, path=list(paths)):
        return dist.version
    return None


def downloaded_version(engine_id: str) -> Optional[str]:
    folder = engine_dir(engine_id)
    if not folder.is_dir():
        return None
    return _dist_version(engine_id, [str(folder)])


def bundled_version(engine_id: str) -> Optional[str]:
    """Version shipped with the app (or installed in the venv), ignoring downloaded copies."""
    root = os.path.normcase(str(engines_dir()))
    paths = [p for p in sys.path if not os.path.normcase(str(p)).startswith(root)]
    return _dist_version(engine_id, paths)


def next_start_version(engine_id: str) -> Optional[str]:
    bundled, downloaded = bundled_version(engine_id), downloaded_version(engine_id)
    return downloaded if is_newer(downloaded, bundled) else bundled


def activate_engines() -> None:
    """Put downloaded engines that are newer than the bundled ones first on ``sys.path``.

    Must run before anything imports yt_dlp or gallery_dl.
    """
    for engine in ENGINES:
        bundled, downloaded = bundled_version(engine.id), downloaded_version(engine.id)
        if is_newer(downloaded, bundled):
            entry = str(engine_dir(engine.id))
            if entry not in sys.path:
                sys.path.insert(0, entry)
            _in_use[engine.id] = downloaded or ""
        elif bundled:
            _in_use[engine.id] = bundled
    importlib.invalidate_caches()


def status(settings: Any) -> List[Dict[str, Any]]:
    """What the Settings page shows for each engine."""
    latest_info: Dict[str, Any] = settings.get("engineLatest") or {}
    result = []
    for engine in ENGINES:
        bundled = bundled_version(engine.id)
        upcoming = next_start_version(engine.id)
        current = _in_use.get(engine.id) or upcoming
        latest = (latest_info.get(engine.id) or {}).get("version")
        result.append(
            {
                "id": engine.id,
                "version": current,
                "latest": latest,
                "updateAvailable": is_newer(latest, upcoming),
                "restartRequired": version_tuple(upcoming) != version_tuple(current),
                "downloaded": upcoming != bundled,
            }
        )
    return result


def _fetch_pypi(name: str) -> Dict[str, Any]:
    req = urllib.request.Request(PYPI_URL.format(name), headers={"User-Agent": "MediaStudio"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _pins(requires_dist: Sequence[str], names: Sequence[str]) -> Dict[str, str]:
    """Exact versions the engine requires for its companions (``yt-dlp-ejs==0.8.0; extra == …``)."""
    pins: Dict[str, str] = {}
    for requirement in requires_dist or []:
        match = re.match(r"\s*([A-Za-z0-9_.-]+)\s*==\s*([A-Za-z0-9_.+-]+)", requirement)
        if match and match.group(1).lower() in names and match.group(1).lower() not in pins:
            pins[match.group(1).lower()] = match.group(2)
    return pins


def check_updates(settings: Any, fetch: Callable[[str], Dict[str, Any]] = _fetch_pypi) -> List[Dict[str, Any]]:
    """Ask PyPI for the newest version of each engine and remember the answer."""
    latest: Dict[str, Any] = dict(settings.get("engineLatest") or {})
    errors = []
    for engine in ENGINES:
        try:
            info = fetch(engine.id).get("info") or {}
        except Exception as exc:  # noqa: BLE001 - one unreachable package must not hide the other
            errors.append(exc)
            continue
        version = info.get("version")
        if version:
            latest[engine.id] = {"version": version, "pins": _pins(info.get("requires_dist") or [], engine.companions)}
    if len(errors) == len(ENGINES):
        raise errors[0]
    settings.update({"engineLatest": latest, "engineLastCheck": time.time()})
    return status(settings)


def auto_check_due(settings: Any, now: Optional[float] = None) -> bool:
    if not settings.get("engineUpdateCheck", True):
        return False
    last = float(settings.get("engineLastCheck") or 0)
    return (now if now is not None else time.time()) - last >= CHECK_INTERVAL_S


def install_specs(engine: Engine, latest: Dict[str, Any]) -> List[str]:
    """pip requirement strings for an update: the engine and its companions at their pinned versions."""
    pins = latest.get("pins") or {}
    specs = [f"{engine.id}=={latest['version']}"]
    specs += [f"{name}=={pins[name]}" if name in pins else name for name in engine.companions]
    return specs


def check_command(engine_id: str, folder: Path, report: Path) -> List[str]:
    """Command line of the separate process that verifies a freshly installed engine."""
    if getattr(sys, "frozen", False):
        return [sys.executable, CHECK_FLAG, engine_id, str(folder), str(report)]
    main_py = Path(__file__).resolve().parents[2] / "main.py"
    return [sys.executable, str(main_py), CHECK_FLAG, engine_id, str(folder), str(report)]


def run_check_main(args: Sequence[str]) -> int:
    """Entry point for ``MediaStudio.exe --check-engines <id> <folder> <report.json>``."""
    engine_id, folder, report = args[0], args[1], Path(args[2])
    try:
        engine = get_engine(engine_id)
        sys.path.insert(0, folder)
        importlib.invalidate_caches()
        module = importlib.import_module(engine.module)
        location = os.path.normcase(str(Path(module.__file__ or "").resolve()))
        if not location.startswith(os.path.normcase(str(Path(folder).resolve()))):
            raise RuntimeError(f"{engine.module} was imported from {location}, not from the new copy")
        for name in engine.probe_modules:
            importlib.import_module(name)
        if engine.module == "yt_dlp":
            with module.YoutubeDL({"quiet": True, "no_warnings": True}):
                pass  # builds the request handlers, which is where missing dependencies show up
        report.write_text(json.dumps({"ok": True}), encoding="utf-8")
        return 0
    except BaseException:  # noqa: BLE001 - anything the new copy raises means it must not be used
        report.write_text(json.dumps({"ok": False, "error": traceback.format_exc()}), encoding="utf-8")
        return 1


def replace_with_staged(engine_id: str) -> None:
    """Swap the verified staging folder in for the current downloaded copy."""
    target, staged = engine_dir(engine_id), staging_dir(engine_id)
    old = engines_dir() / f"{engine_id}.old"
    shutil.rmtree(old, ignore_errors=True)
    if target.exists():
        target.rename(old)
    staged.rename(target)
    shutil.rmtree(old, ignore_errors=True)


def reset() -> None:
    """Remove every downloaded engine; the bundled ones are used from the next start."""
    folder = engines_dir()
    if folder.is_dir():
        shutil.rmtree(folder)
