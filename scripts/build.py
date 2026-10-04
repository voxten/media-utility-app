"""Builds the distributable app: frontend → PyInstaller one-folder bundle → smoke test.

    python scripts/build.py                  # full build
    python scripts/build.py --skip-frontend  # reuse frontend/dist
    python scripts/build.py --no-selftest

Output: dist/MediaStudio/MediaStudio.exe
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

FRONTEND = ROOT / "frontend"
SPEC = ROOT / "packaging" / "MediaStudio.spec"
DIST = ROOT / "dist"
EXE = DIST / "MediaStudio" / "MediaStudio.exe"


def get_app_version() -> str:
    try:
        from backend import APP_VERSION
        return APP_VERSION
    except Exception:
        try:
            init_file = ROOT / "backend" / "__init__.py"
            for line in init_file.read_text(encoding="utf-8").splitlines():
                if line.startswith("APP_VERSION"):
                    return line.split("=")[1].strip().strip('"').strip("'")
        except Exception:
            pass
    return "0.9.0"


def step(title: str) -> None:
    print(f"\n=== {title} ===", flush=True)


def run(cmd: list, cwd: Path = ROOT) -> None:
    print("$", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run(cmd, cwd=cwd, check=True, shell=sys.platform == "win32" and cmd[0] == "npm")


def build_frontend(clean_install: bool) -> None:
    step("Frontend")
    if clean_install or not (FRONTEND / "node_modules").is_dir():
        run(["npm", "ci"], cwd=FRONTEND)
    run(["npm", "run", "build"], cwd=FRONTEND)


def build_bundle() -> None:
    step("PyInstaller")
    internal_frontend = DIST / "MediaStudio" / "_internal" / "frontend"
    if internal_frontend.is_dir():
        shutil.rmtree(internal_frontend, ignore_errors=True)
    run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--distpath", str(DIST), "--workpath", str(ROOT / "build"), str(SPEC)])


def selftest() -> bool:
    step("Self-test of the bundle")
    # Run from an unrelated directory to catch paths that only work relative to the repo.
    with tempfile.TemporaryDirectory() as cwd:
        report_path = Path(cwd) / "selftest.json"
        start = time.perf_counter()
        code = subprocess.run([str(EXE), "--selftest", str(report_path)], cwd=cwd, timeout=300).returncode
        if not report_path.is_file():
            print(f"FAILED: no report written (exit code {code})")
            return False
        report = json.loads(report_path.read_text(encoding="utf-8"))
    for name, status in report["modules"].items():
        print(f"  import {name:<16} {status}")
    for name, check in report["checks"].items():
        print(f"  check  {name:<16} {'ok' if check['ok'] else 'FAIL'}")
        if not check["ok"]:
            print("    " + check["error"].strip().replace("\n", "\n    "))
    for dep in report.get("dependencies", []):
        if isinstance(dep, dict):
            print(f"  dep    {dep['id']:<16} {'ok' if dep['ok'] else 'missing'}")
    print(f"Self-test {'PASSED' if report['ok'] else 'FAILED'} in {time.perf_counter() - start:.1f}s")
    return bool(report["ok"])


def bundle_size() -> str:
    total = sum(f.stat().st_size for f in (DIST / "MediaStudio").rglob("*") if f.is_file())
    return f"{total / 1024 / 1024:.0f} MB"


def find_iscc() -> Optional[Path]:
    which = shutil.which("iscc") or shutil.which("ISCC")
    if which:
        return Path(which)
    candidates = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Inno Setup 6" / "ISCC.exe",
        Path("C:/Program Files (x86)/Inno Setup 6/ISCC.exe"),
        Path("C:/Program Files/Inno Setup 6/ISCC.exe"),
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


def build_installer(version: Optional[str] = None) -> Path:
    ver = version or get_app_version()
    step(f"Inno Setup Installer (v{ver})")
    iscc = find_iscc()
    if not iscc:
        sys.exit("Inno Setup (ISCC.exe) not found. Install it with: winget install JRSoftware.InnoSetup")
    iss_file = ROOT / "packaging" / "MediaStudio.iss"
    out_dir = DIST / "installer"
    out_dir.mkdir(parents=True, exist_ok=True)
    run([str(iscc), f"/DMyAppVersion={ver}", f'/O{out_dir}', f"/FMediaStudio-Setup-{ver}", str(iss_file)])
    setup_exe = out_dir / f"MediaStudio-Setup-{ver}.exe"
    if setup_exe.is_file():
        size_mb = setup_exe.stat().st_size / (1024 * 1024)
        print(f"\nInstaller created: {setup_exe} ({size_mb:.1f} MB)")
        return setup_exe
    sys.exit(f"Expected installer not found at {setup_exe}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--clean-install", action="store_true", help="run npm ci even if node_modules exists")
    parser.add_argument("--no-selftest", action="store_true")
    parser.add_argument("--installer", action="store_true", help="build Windows Setup Installer (.exe)")
    args = parser.parse_args()

    if shutil.which("npm") is None and not args.skip_frontend:
        sys.exit("npm not found: install Node.js or use --skip-frontend with an existing frontend/dist")
    if not args.skip_frontend:
        build_frontend(args.clean_install)
    if not (FRONTEND / "dist" / "index.html").is_file():
        sys.exit("frontend/dist/index.html missing")
    build_bundle()
    print(f"\nBuilt {EXE} ({bundle_size()})")
    if not args.no_selftest and not selftest():
        sys.exit(1)
    if args.installer:
        build_installer()


if __name__ == "__main__":
    main()
