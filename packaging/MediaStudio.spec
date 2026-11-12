# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for Media Studio (pywebview + React). Build with: python scripts/build.py
# One-folder build: faster start-up than one-file and plays well with WebView2.

import importlib.util
import os
import sys

from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))  # noqa: F821 - SPECPATH is injected by PyInstaller

# Optional AI packages (PyTorch, rembg) are pip-installed after setup by backend/core/addons.py and may
# import any part of the standard library, so the whole stdlib ships, minus GUI, tests and installers.
STDLIB_SKIP = {
    "tkinter", "_tkinter", "turtle", "turtledemo", "idlelib", "test", "ensurepip", "venv",
    "this", "antigravity", "__hello__", "__phello__",
}


def stdlib_modules():
    names = []
    for top in sorted(sys.stdlib_module_names):
        if top in STDLIB_SKIP:
            continue
        spec = importlib.util.find_spec(top)
        if spec is None:
            continue  # not available on this platform (e.g. curses-only modules)
        names.append(top)
        for base in spec.submodule_search_locations or []:
            for folder, dirs, files in os.walk(base):
                dirs[:] = [d for d in dirs if d not in ("test", "tests", "idle_test", "__pycache__")]
                package = top if folder == base else top + "." + os.path.relpath(folder, base).replace(os.sep, ".")
                names += [f"{package}.{f[:-3]}" for f in files if f.endswith(".py") and f != "__init__.py"]
                if folder != base:
                    names.append(package)
    return names


a = Analysis(
    [os.path.join(ROOT, "main.py")],
    pathex=[ROOT],
    binaries=[],
    datas=[
        (os.path.join(ROOT, "frontend", "dist"), os.path.join("frontend", "dist")),
        (os.path.join(ROOT, "assets", "app.ico"), "assets"),
        (os.path.join(ROOT, "assets", "app.png"), "assets"),
        # pip runs inside the app for add-ons: its CA bundle and script launchers are data files.
        *collect_data_files("pip"),
        # Versions of the bundled download engines, compared with copies updated from Settings.
        *copy_metadata("yt-dlp"),
        *copy_metadata("yt-dlp-ejs"),
        *copy_metadata("gallery-dl"),
    ],
    hiddenimports=[
        "backend.selftest",  # imported lazily by --selftest
        "pyttsx3.drivers",
        "pyttsx3.drivers.sapi5",
        "comtypes.stream",
        "edge_tts",
        *collect_submodules("backend.services"),  # bridge/api.py imports them by name, on first use
        "gallery_dl.extractor.instagram",
        "backend.core.addons",
        "pystray._win32",  # picked at runtime by platform, invisible to the import scan
        *collect_submodules("pip"),
        *stdlib_modules(),
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Old Qt UI and its browser renderer are not part of the new app.
        "PyQt5",
        "PyQt6",
        "PySide2",
        "PySide6",
        "qtgui",
        "qtwidgets",
        "playwright",
        # imagehash imports these lazily; duplicates.py has its own SciPy-free phash (~70 MB saved).
        "scipy",
        "pywt",
        # Add-ons installed from Settings; kept out even when the build venv has them.
        "torch",
        "torchvision",
        "torchgen",
        "functorch",
        "rembg",
        "onnxruntime",
        # Dev/test tooling and unused GUI toolkits.
        "tkinter",
        "_tkinter",
        "matplotlib",
        "IPython",
        "pytest",
        "_pytest",
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)


def version_info():
    """Details shown in the exe's Properties dialog, from backend/__init__.py."""
    import re

    from PyInstaller.utils.win32.versioninfo import (
        FixedFileInfo, StringFileInfo, StringStruct, StringTable, VarFileInfo, VarStruct, VSVersionInfo,
    )

    with open(os.path.join(ROOT, "backend", "__init__.py"), encoding="utf-8") as f:
        version = re.search(r'APP_VERSION = "([^"]+)"', f.read()).group(1)
    numbers = tuple(int(n) for n in (re.findall(r"\d+", version) + ["0"] * 4)[:4])
    strings = [
        StringStruct("CompanyName", "Voxten"),
        StringStruct("FileDescription", "Media Studio"),
        StringStruct("FileVersion", version),
        StringStruct("InternalName", "MediaStudio"),
        StringStruct("LegalCopyright", "Copyright (c) Voxten"),
        StringStruct("OriginalFilename", "MediaStudio.exe"),
        StringStruct("ProductName", "Media Studio"),
        StringStruct("ProductVersion", version),
    ]
    return VSVersionInfo(
        ffi=FixedFileInfo(filevers=numbers, prodvers=numbers),
        kids=[StringFileInfo([StringTable("040904B0", strings)]), VarFileInfo([VarStruct("Translation", [0x0409, 1200])])],
    )


exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="MediaStudio",
    icon=os.path.join(ROOT, "assets", "app.ico"),
    version=version_info(),
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # UPX-compressed DLLs trigger antivirus false positives and break some Qt/.NET loaders
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="MediaStudio",
)
