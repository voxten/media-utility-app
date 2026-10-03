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
    if target.exists() and target.is_file():
        if sys.platform == "win32":
            subprocess.Popen(["explorer", "/select,", str(target)])
            return
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(target)])
            return

    # Fall back to opening the parent folder (or target if it is a directory)
    folder = target if target.is_dir() else target.parent
    if folder.exists():
        open_path(str(folder))
    elif target.exists():
        open_path(str(target))
    else:
        raise FileNotFoundError(path)


def move_to_trash(path: str) -> None:
    from send2trash import send2trash

    target = Path(path)
    if not target.exists():
        raise FileNotFoundError(path)
    send2trash(str(target))
