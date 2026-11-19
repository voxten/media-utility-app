"""Optional Python packages (PyTorch, rembg …) installed on demand from Settings.

From source they go into the running interpreter like any other package. The packaged app
cannot do that: its interpreter is MediaStudio.exe and only sees its own bundle. There, pip
runs inside the app (``MediaStudio.exe --pip …``) and installs into a per-user folder that is
added to ``sys.path``. The folder is tied to the bundled Python version so an app update that
moves to a newer Python never loads binaries built for the old one.
"""

import csv
import importlib
import importlib.util
import logging
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Dict, List, NamedTuple, Optional, Sequence, Set, Tuple

from backend.core.paths import local_data_dir

logger = logging.getLogger(__name__)

# Lets tests and manual checks point the packaged app at a scratch folder.
ADDONS_DIR_ENV = "MEDIASTUDIO_ADDONS_DIR"
PIP_FLAG = "--pip"
# Written into the staging folder before its contents move into the add-ons folder: from then on
# the staged install is complete, and a move that was cut off is finished at the next start.
READY_MARKER = ".ready"


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def addons_dir() -> Path:
    override = os.environ.get(ADDONS_DIR_ENV)
    if override:
        return Path(override)
    return local_data_dir() / "addons" / f"cp{sys.version_info.major}{sys.version_info.minor}"


def activate_addons() -> None:
    """Make packages installed for the packaged app importable (no-op when running from source)."""
    if not is_frozen():
        return
    folder = addons_dir()
    if not folder.is_dir():
        return
    entry = str(folder)
    if entry not in sys.path:
        # Appended, so the app's own bundled copies of shared packages (numpy, Pillow …) win.
        sys.path.append(entry)
    importlib.invalidate_caches()


def staging_dir() -> Path:
    """Where pip puts a new add-on first, next to the add-ons folder (same disk, so moving is a rename)."""
    folder = addons_dir()
    return folder.with_name(f"{folder.name}.staging")


def _normalize(name: str) -> str:
    return re.sub(r"[-_.]+", "_", name).lower()


def _project(dist_info: str) -> str:
    return _normalize(dist_info.split("-")[0])


def _trash_dir(folder: Path) -> Path:
    return folder.with_name(f"{folder.name}.old")


def _set_aside(path: Path, trash: Path) -> None:
    target, counter = trash / path.name, 1
    while target.exists() or target.is_symlink():
        target = trash / f"{path.name}.{counter}"
        counter += 1
    os.replace(path, target)


def _is_shared_dir(path: Path) -> bool:
    """A folder several packages put things in: scripts (``bin``), or a namespace such as ``google``
    that holds only other folders. It is merged, so one add-on never takes away another's part."""
    if not path.is_dir() or path.is_symlink():
        return False
    return path.name == "bin" or not any(child.is_file() for child in path.iterdir())


def _move_in(item: Path, dest: Path, trash: Path) -> None:
    if _is_shared_dir(item) and dest.is_dir() and not dest.is_symlink():
        for child in list(item.iterdir()):
            _move_in(child, dest / child.name, trash)
        item.rmdir()
        return
    if dest.exists() or dest.is_symlink():
        _set_aside(dest, trash)
    os.replace(item, dest)


def is_merge_pending(staged: Path) -> bool:
    return (staged / READY_MARKER).is_file()


def merge_staged(staged: Path, folder: Path) -> None:
    """Moves a finished install from ``staged`` into ``folder``.

    Packages of the same name are replaced, and so is the metadata of their older versions, the way
    ``pip install --target --upgrade`` does it. Every step is a rename, so no package is ever half
    copied or half deleted: what gets replaced is set aside in ``<folder>.old`` and deleted at the
    end, and metadata moves last, so a package only looks installed once its files are in place.
    Called again on a merge that was cut off, it moves the rest.
    """
    (staged / READY_MARKER).touch()
    folder.mkdir(parents=True, exist_ok=True)
    trash = _trash_dir(folder)
    trash.mkdir(exist_ok=True)
    items = [item for item in staged.iterdir() if item.name != READY_MARKER]
    projects = {_project(item.name) for item in items if item.name.endswith(".dist-info")}
    for old in folder.glob("*.dist-info"):
        if _project(old.name) in projects:
            _set_aside(old, trash)
    for item in sorted(items, key=lambda path: path.name.endswith(".dist-info")):
        _move_in(item, folder / item.name, trash)
    (staged / READY_MARKER).unlink()
    shutil.rmtree(trash, ignore_errors=True)
    _scan_cache.clear()


def finish_interrupted_install() -> None:
    """Completes an add-on install the app was closed in the middle of, and removes its leftovers.

    Runs at start, before anything imports an add-on: a loaded DLL could not be moved.
    """
    if not is_frozen():
        return
    staged, folder = staging_dir(), addons_dir()
    if is_merge_pending(staged):
        logger.warning("Finishing an add-on install that was cut off: %s", staged)
        try:
            merge_staged(staged, folder)
        except OSError:
            logger.exception("Could not finish the add-on install; it is retried at the next start")
            return
    # A pip run that was cut off leaves an incomplete staging folder, which is never used.
    shutil.rmtree(staged, ignore_errors=True)
    shutil.rmtree(_trash_dir(folder), ignore_errors=True)


class _Distribution(NamedTuple):
    name: str
    modules: Set[str]
    requires: Set[str]
    missing: int
    total: int


# One scan per start; the key changes when any RECORD does, so a reinstall is seen at once.
_scan_cache: Dict[Tuple[str, Tuple[Tuple[str, int], ...]], Dict[str, _Distribution]] = {}


def _record_mtime(dist_info: Path) -> int:
    try:
        return (dist_info / "RECORD").stat().st_mtime_ns
    except OSError:
        return -1


def _requirements(dist_info: Path) -> Set[str]:
    """Projects ``dist_info`` needs, leaving out optional extras."""
    try:
        text = (dist_info / "METADATA").read_text(encoding="utf-8", errors="replace")
    except OSError:
        return set()
    names = set()
    for line in text.splitlines():
        if not line.startswith("Requires-Dist:"):
            continue
        spec, _, marker = line[len("Requires-Dist:"):].partition(";")
        match = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9._-]*)", spec)
        if match and "extra" not in marker:
            names.add(_normalize(match.group(1)))
    return names


def _check_distribution(folder: Path, dist_info: Path, listings: Dict[str, Dict[str, int]]) -> _Distribution:
    """Compares what pip recorded for ``dist_info`` with the files on disk (presence and size)."""

    def listing(relative_dir: str) -> Dict[str, int]:
        if relative_dir not in listings:
            files: Dict[str, int] = {}
            try:
                with os.scandir(folder / relative_dir) as entries:
                    for entry in entries:
                        if entry.is_file():
                            files[os.path.normcase(entry.name)] = entry.stat().st_size
            except OSError:
                pass
            listings[relative_dir] = files
        return listings[relative_dir]

    modules: Set[str] = set()
    missing = total = 0
    try:
        with (dist_info / "RECORD").open(encoding="utf-8", newline="") as record:
            rows = list(csv.reader(record))
    except OSError:
        rows = []
        missing = total = 1
    for row in rows:
        if not row:
            continue
        path = row[0].replace("\\", "/")
        # Scripts are recorded outside the folder (``../../bin``), and bytecode is rebuilt when missing.
        if path.startswith("../") or path.startswith("/") or path.endswith(".pyc"):
            continue
        parent, _, name = path.rpartition("/")
        top = path.split("/")[0]
        if not top.endswith((".dist-info", ".data")) and top not in ("bin", "__pycache__"):
            modules.add(top[:-3] if top.endswith(".py") else top)
        total += 1
        size = listing(parent).get(os.path.normcase(name))
        if size is None or (len(row) > 2 and row[2].isdigit() and int(row[2]) != size):
            missing += 1
    return _Distribution(_project(dist_info.name), modules, _requirements(dist_info), missing, total)


def _scan(folder: Path) -> Dict[str, _Distribution]:
    """Every project installed in ``folder``, by normalized name, with how many of its files are gone."""
    newest: Dict[str, Path] = {}
    for dist_info in folder.glob("*.dist-info"):
        project = _project(dist_info.name)
        # An older version's metadata left next to the current one describes files that were replaced.
        if project not in newest or _record_mtime(dist_info) > _record_mtime(newest[project]):
            newest[project] = dist_info
    key = (str(folder), tuple(sorted((path.name, _record_mtime(path)) for path in newest.values())))
    cached = _scan_cache.get(key)
    if cached is not None:
        return cached
    listings: Dict[str, Dict[str, int]] = {}
    result = {project: _check_distribution(folder, path, listings) for project, path in newest.items()}
    for dist in result.values():
        if dist.missing:
            logger.warning("Add-on package %s is damaged: %d of %d files missing", dist.name, dist.missing, dist.total)
    _scan_cache.clear()
    _scan_cache[key] = result
    return result


def is_damaged(module: str) -> bool:
    """True when ``module`` comes from the add-ons folder and files of it, or of a package it needs
    there, are missing, e.g. after an install that was cut off."""
    if not is_frozen():
        return False
    folder = addons_dir()
    if not folder.is_dir():
        return False
    dists = _scan(folder)
    owner = next((d.name for d in dists.values() if module in d.modules), _normalize(module))
    if owner not in dists:
        return False
    seen, pending = set(), [owner]
    while pending:
        name = pending.pop()
        if name in seen or name not in dists:
            continue
        seen.add(name)
        if dists[name].missing:
            return True
        pending.extend(dists[name].requires)
    return False


def module_available(name: str) -> bool:
    """``name`` can be imported as far as a check without importing it can tell.

    ``find_spec`` alone is not enough: a package folder whose files are gone still counts for it,
    as a namespace package, and only fails on import.
    """
    try:
        if importlib.util.find_spec(name) is None:
            return False
    except (ImportError, ValueError):
        return False
    return not is_damaged(name)


def pip_install_command(packages: Sequence[str], target: Optional[Path] = None, no_deps: bool = False) -> List[str]:
    """Command line that installs ``packages`` where the running app can import them.

    ``target`` installs into that folder instead (also from source); ``no_deps`` leaves out
    dependencies the app already ships.
    """
    common = ["--disable-pip-version-check", "--no-warn-script-location"]
    if no_deps:
        common.append("--no-deps")
    if not is_frozen():
        location = ["--target", str(target)] if target is not None else []
        return [sys.executable, "-m", "pip", "install", *common, *location, *packages]
    folder = target if target is not None else addons_dir()
    folder.mkdir(parents=True, exist_ok=True)
    return [
        sys.executable,
        PIP_FLAG,
        "install",
        *common,
        "--target",
        str(folder),
        # Packages already installed for an earlier add-on are replaced instead of skipped.
        "--upgrade",
        # Building from source would need a compiler and a real python.exe, neither of which exists here.
        "--only-binary=:all:",
        *packages,
    ]


def run_pip_main(args: Sequence[str]) -> int:
    """Entry point for ``MediaStudio.exe --pip …``: runs pip inside the bundled interpreter."""
    if is_frozen():
        # distlib reads its .exe launchers through a finder chosen by loader type and does not know
        # PyInstaller's loader; the files themselves are bundled next to its modules.
        import pip._vendor.distlib as distlib
        from pip._vendor.distlib import resources

        resources.register_finder(distlib.__loader__, resources.ResourceFinder)

    from pip._internal.cli.main import main as pip_main

    try:
        return int(pip_main(list(args)) or 0)
    except SystemExit as exc:  # some pip commands (e.g. --version) exit instead of returning
        return exc.code if isinstance(exc.code, int) else int(exc.code is not None)
