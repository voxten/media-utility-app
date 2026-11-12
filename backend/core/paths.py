"""Filesystem locations that must not depend on the current working directory."""

import logging
import os
import shutil
import sys
import time
from pathlib import Path
from typing import List, Optional, Set

APP_NAME = "MediaStudio"

logger = logging.getLogger(__name__)


def project_root() -> Path:
    """Root of the source tree, or the PyInstaller extraction dir when frozen."""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parents[2]


def resource_path(*parts: str) -> Path:
    return project_root().joinpath(*parts)


def app_data_dir() -> Path:
    """Per-user writable directory (%APPDATA%\\MediaStudio on Windows)."""
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    path = base / APP_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def local_data_dir() -> Path:
    """Per-user data kept on this computer only (%LOCALAPPDATA%\\MediaStudio on Windows).

    For what is large and can be downloaded again: a roaming profile would copy it on every sign-in.
    """
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    path = base / APP_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def models_dir() -> Path:
    """Downloaded AI models (LaMa, Real-ESRGAN, rembg, Whisper)."""
    path = local_data_dir() / "models"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _move_tree(source: Path, target: Path) -> List[str]:
    """Move everything in ``source`` into ``target``; returns what could not be moved."""
    left: List[str] = []
    for item in list(source.iterdir()):
        destination = target / item.name
        try:
            if not destination.exists():
                shutil.move(str(item), str(destination))  # a rename on the same drive
            elif item.is_dir() and destination.is_dir():
                left += _move_tree(item, destination)
                item.rmdir()
            else:
                left.append(str(item))  # already there; the copy in the new place wins
        except OSError as exc:
            left.append(f"{item}: {exc}")
    return left


# Large folders that older versions kept in the roaming profile (models until 0.13.0, the rest until 0.14.0).
LOCAL_FOLDERS = ("models", "cache", "addons", "bin", "engines")
CACHE_MAX_AGE_S = 7 * 24 * 3600


def migrate_to_local() -> None:
    """Move what older versions downloaded into %APPDATA% to %LOCALAPPDATA%, so sign-ins stay fast."""
    for name in LOCAL_FOLDERS:
        migrate_folder(app_data_dir() / name, local_data_dir() / name)


def migrate_folder(old: Path, new: Path) -> None:
    """Move everything in ``old`` into ``new``; a file already in ``new`` wins and ``old`` keeps its copy."""
    if not old.is_dir():
        return
    new.mkdir(parents=True, exist_ok=True)
    if os.path.normcase(str(old.resolve())) == os.path.normcase(str(new.resolve())):
        return
    started = time.monotonic()
    left = _move_tree(old, new)
    if left:
        logger.warning("Some files stayed in %s: %s", old, "; ".join(left))
        return
    old.rmdir()
    logger.info("Moved %s to %s in %.1f s", old, new, time.monotonic() - started)


def cache_dir() -> Path:
    """Previews and results waiting to be saved; anything older than a week is removed at start."""
    path = local_data_dir() / "cache"
    path.mkdir(parents=True, exist_ok=True)
    return path


def bin_dir() -> Path:
    """FFmpeg and gifsicle installed from Settings."""
    return local_data_dir() / "bin"


def clean_cache(max_age_s: float = CACHE_MAX_AGE_S, folder: Optional[Path] = None) -> int:
    """Removes cache entries not touched for ``max_age_s``; returns how many were removed."""
    folder = folder or cache_dir()
    cutoff = time.time() - max_age_s
    removed = 0
    for item in list(folder.iterdir()):
        try:
            if item.stat().st_mtime >= cutoff:
                continue
            if item.is_dir() and not item.is_symlink():
                shutil.rmtree(item)
            else:
                item.unlink()
            removed += 1
        except OSError:
            continue  # still open somewhere; next start tries again
    if removed:
        logger.info("Removed %d old cache entries from %s", removed, folder)
    return removed


def default_output_dir() -> Path:
    return Path.home() / "Downloads"


def unique_path(path: Path, taken: Optional[Set[Path]] = None) -> Path:
    """``path``, or ``name (1).ext``, ``name (2).ext``… when that file exists or another output of the batch took it.

    Pass the same ``taken`` set for every output of one batch whose files are all named before any is written.
    """
    candidate, counter = path, 1
    while candidate.exists() or (taken is not None and candidate in taken):
        candidate = path.with_name(f"{path.stem} ({counter}){path.suffix}")
        counter += 1
    if taken is not None:
        taken.add(candidate)
    return candidate
