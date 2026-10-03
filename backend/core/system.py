"""OS integration: opening folders, revealing files, moving to the recycle bin."""

import os
import subprocess
import sys
from pathlib import Path


def open_path(path: str) -> None:
    target = Path(path)
    if not target.exists():
        raise FileNotFoundError(path)
    if sys.platform == "win32":
        os.startfile(str(target))  # noqa: S606 - user-chosen local path
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(target)])
    else:
        subprocess.Popen(["xdg-open", str(target)])


def reveal_in_folder(path: str) -> None:
    """Open the containing folder with the file selected (falls back to opening the folder)."""
    target = Path(path)
    if sys.platform == "win32" and target.exists():
        subprocess.Popen(["explorer", "/select,", str(target)])
    elif sys.platform == "darwin" and target.exists():
        subprocess.Popen(["open", "-R", str(target)])
    else:
        open_path(str(target.parent if target.is_file() else target))


def move_to_trash(path: str) -> None:
    from send2trash import send2trash

    target = Path(path)
    if not target.exists():
        raise FileNotFoundError(path)
    send2trash(str(target))
