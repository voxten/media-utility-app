"""Builds the distributable app: frontend → PyInstaller one-folder bundle → smoke test.

    python scripts/build.py                  # full build
    python scripts/build.py --skip-frontend  # reuse frontend/dist
    python scripts/build.py --no-selftest

Output: dist/MediaStudio/MediaStudio.exe
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
SPEC = ROOT / "packaging" / "MediaStudio.spec"
DIST = ROOT / "dist"
EXE = DIST / "MediaStudio" / "MediaStudio.exe"


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--clean-install", action="store_true", help="run npm ci even if node_modules exists")
    parser.add_argument("--no-selftest", action="store_true")
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


if __name__ == "__main__":
    main()
