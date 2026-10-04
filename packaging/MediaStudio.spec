# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for Media Studio (pywebview + React). Build with: python scripts/build.py
# One-folder build: faster start-up than one-file and plays well with WebView2.

import os

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))  # noqa: F821 - SPECPATH is injected by PyInstaller

a = Analysis(
    [os.path.join(ROOT, "main.py")],
    pathex=[ROOT],
    binaries=[],
    datas=[
        (os.path.join(ROOT, "frontend", "dist"), os.path.join("frontend", "dist")),
        (os.path.join(ROOT, "assets", "app.ico"), "assets"),
        (os.path.join(ROOT, "assets", "app.png"), "assets"),
    ],
    hiddenimports=[
        "backend.selftest",  # imported lazily by --selftest
        "pyttsx3.drivers",
        "pyttsx3.drivers.sapi5",
        "comtypes.stream",
        "edge_tts",
        "backend.services.ai_models",
        "backend.services.deps_installer",
        "backend.services.rembg_service",
        "backend.services.upscale",
        "backend.services.watermark",
        "backend.services.converter",
        "backend.services.download",
        "backend.services.duplicates",
        "backend.services.pdf",
        "backend.services.progress_image",
        "backend.services.tts",
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
        "features",
        # imagehash imports these lazily; duplicates.py has its own SciPy-free phash (~70 MB saved).
        "scipy",
        "pywt",
        # Dev/test tooling and unused GUI toolkits.
        "tkinter",
        "matplotlib",
        "IPython",
        "pytest",
        "_pytest",
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="MediaStudio",
    icon=os.path.join(ROOT, "assets", "app.ico"),
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
