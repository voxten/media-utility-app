"""OS integration: opening folders, revealing files, moving to the recycle bin."""

import os
import subprocess
import sys
from pathlib import Path


# Opening one of these runs it. The app only ever opens folders, its own results and files the
# user scanned, none of which need that, so such a file is shown in Explorer instead.
RUNNABLE_EXTENSIONS = frozenset(
    {
        ".appref-ms", ".application", ".appx", ".appxbundle", ".bat", ".cmd", ".com", ".cpl",
        ".diagcab", ".exe", ".gadget", ".hta", ".inf", ".jar", ".js", ".jse", ".lnk", ".msc",
        ".msi", ".msix", ".msixbundle", ".msp", ".pif", ".ps1", ".psm1", ".py", ".pyw", ".reg",
        ".scf", ".scr", ".search-ms", ".settingcontent-ms", ".url", ".vbe", ".vbs", ".ws",
        ".wsf", ".wsh",
    }
)


def is_runnable(path: Path) -> bool:
    """True for a file Windows would execute when opened (PATHEXT adds any locally registered types)."""
    if path.is_dir():
        return False
    extra = {ext.strip().lower() for ext in os.environ.get("PATHEXT", "").split(";") if ext.strip()}
    # Windows ignores trailing dots and spaces, so "setup.exe. " still runs as an .exe.
    suffix = Path(path.name.rstrip(". ")).suffix.lower()
    return suffix in RUNNABLE_EXTENSIONS or suffix in extra


def open_path(path: str) -> None:
    target = Path(path)
    if not target.exists():
        raise FileNotFoundError(path)
    if is_runnable(target):
        reveal_in_folder(path)
        return
    if sys.platform == "win32":
        os.startfile(str(target))  # noqa: S606 - checked above: a folder or a file that does not run
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
