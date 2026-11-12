"""Optional Python packages (PyTorch, rembg …) installed on demand from Settings.

From source they go into the running interpreter like any other package. The packaged app
cannot do that: its interpreter is MediaStudio.exe and only sees its own bundle. There, pip
runs inside the app (``MediaStudio.exe --pip …``) and installs into a per-user folder that is
added to ``sys.path``. The folder is tied to the bundled Python version so an app update that
moves to a newer Python never loads binaries built for the old one.
"""

import importlib
import os
import re
import shutil
import sys
from pathlib import Path
from typing import List, Optional, Sequence

from backend.core.paths import app_data_dir

# Lets tests and manual checks point the packaged app at a scratch folder.
ADDONS_DIR_ENV = "MEDIASTUDIO_ADDONS_DIR"
PIP_FLAG = "--pip"


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def addons_dir() -> Path:
    override = os.environ.get(ADDONS_DIR_ENV)
    if override:
        return Path(override)
    return app_data_dir() / "addons" / f"cp{sys.version_info.major}{sys.version_info.minor}"


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


def _project(dist_info: str) -> str:
    return re.sub(r"[-_.]+", "_", dist_info.split("-")[0]).lower()


def merge_staged(staged: Path, folder: Path) -> None:
    """Moves a finished install from ``staged`` into ``folder``.

    Packages of the same name are replaced, and so is the metadata of their older versions, the way
    ``pip install --target --upgrade`` does it.
    """
    folder.mkdir(parents=True, exist_ok=True)
    projects = {_project(item.name) for item in staged.glob("*.dist-info")}
    for old in folder.glob("*.dist-info"):
        if _project(old.name) in projects:
            shutil.rmtree(old)
    for item in staged.iterdir():
        dest = folder / item.name
        if dest.is_dir() and not dest.is_symlink():
            shutil.rmtree(dest)
        elif dest.exists():
            dest.unlink()
        os.replace(item, dest)


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
