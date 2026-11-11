"""Filesystem locations that must not depend on the current working directory."""

import os
import sys
from pathlib import Path
from typing import Optional, Set

APP_NAME = "MediaStudio"


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


def cache_dir() -> Path:
    path = app_data_dir() / "cache"
    path.mkdir(parents=True, exist_ok=True)
    return path


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
