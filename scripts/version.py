"""Media Studio version manager.

Single Source of Truth (SSOT) is `backend/__init__.py` (APP_VERSION).
This script allows viewing or bumping the version across the project:

    python scripts/version.py                 # Print current version
    python scripts/version.py 0.10.0          # Set explicit version
    python scripts/version.py patch           # Bump patch (0.9.0 -> 0.9.1)
    python scripts/version.py minor           # Bump minor (0.9.0 -> 0.10.0)
    python scripts/version.py major           # Bump major (0.9.0 -> 1.0.0)
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INIT_PY = ROOT / "backend" / "__init__.py"
PACKAGE_JSON = ROOT / "frontend" / "package.json"
PACKAGE_LOCK_JSON = ROOT / "frontend" / "package-lock.json"


def get_current_version() -> str:
    content = INIT_PY.read_text(encoding="utf-8")
    match = re.search(r'APP_VERSION\s*=\s*["\']([^"\']+)["\']', content)
    if not match:
        sys.exit(f"Error: Could not find APP_VERSION in {INIT_PY}")
    return match.group(1)


def bump_semver(current: str, part: str) -> str:
    match = re.match(r"^(\d+)\.(\d+)\.(\d+)(.*)$", current)
    if not match:
        sys.exit(f"Error: Version '{current}' is not standard semver (major.minor.patch)")
    major, minor, patch, extra = int(match.group(1)), int(match.group(2)), int(match.group(3)), match.group(4)
    if part == "major":
        return f"{major + 1}.0.0"
    elif part == "minor":
        return f"{major}.{minor + 1}.0"
    elif part == "patch":
        return f"{major}.{minor}.{patch + 1}"
    else:
        sys.exit(f"Unknown semver part: {part}")


def set_version(new_ver: str) -> None:
    current = get_current_version()
    if new_ver == current:
        print(f"Version is already {current}")
        return

    # 1. Update backend/__init__.py (Source of Truth)
    init_content = INIT_PY.read_text(encoding="utf-8")
    new_init_content = re.sub(
        r'APP_VERSION\s*=\s*["\'][^"\']+["\']',
        f'APP_VERSION = "{new_ver}"',
        init_content,
    )
    INIT_PY.write_text(new_init_content, encoding="utf-8")

    # 2. Update frontend/package.json
    if PACKAGE_JSON.is_file():
        try:
            pkg = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
            pkg["version"] = new_ver
            PACKAGE_JSON.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
        except Exception as e:
            print(f"Warning: Could not update package.json: {e}", file=sys.stderr)

    # 3. Update frontend/package-lock.json if present
    if PACKAGE_LOCK_JSON.is_file():
        try:
            lock = json.loads(PACKAGE_LOCK_JSON.read_text(encoding="utf-8"))
            lock["version"] = new_ver
            if "packages" in lock and "" in lock["packages"]:
                lock["packages"][""]["version"] = new_ver
            PACKAGE_LOCK_JSON.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
        except Exception as e:
            print(f"Warning: Could not update package-lock.json: {e}", file=sys.stderr)

    print(f"Successfully bumped version: {current} -> {new_ver}")
    print(f"  • Source of truth: {INIT_PY.relative_to(ROOT)}")
    print(f"  • Synced:          {PACKAGE_JSON.relative_to(ROOT)}")
    print(f"  • pyproject.toml:  Uses dynamic versioning (reads backend.APP_VERSION)")
    print(f"  • Inno Setup:      Receives version automatically from build.py")
    print(f"\nReminder: Don't forget to update CHANGELOG.md for release notes!")


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(get_current_version())
        return

    target = args[0].strip()
    if target in ("major", "minor", "patch"):
        new_version = bump_semver(get_current_version(), target)
    else:
        new_version = target

    set_version(new_version)


if __name__ == "__main__":
    main()
