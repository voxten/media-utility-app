"""Exit 1 when the running environment does not satisfy a requirements file.

    python scripts/check_requirements.py requirements.txt

Run with the interpreter that builds the app (scripts/build.py does), so the bundle never
ships without a package or with a version requirements.txt rules out.
"""

import sys
from importlib.metadata import PackageNotFoundError, requires, version
from pathlib import Path
from typing import List

from packaging.requirements import InvalidRequirement, Requirement


def _check(req: Requirement, found: List[str], parent: str = "") -> None:
    source = f" (needed by {parent})" if parent else ""
    try:
        installed = version(req.name)
    except PackageNotFoundError:
        found.append(f"{req.name}: not installed{source}")
        return
    if req.specifier and not req.specifier.contains(installed, prereleases=True):
        found.append(f"{req.name}: {installed} installed, {req.specifier} required{source}")
        return
    # pip check skips what extras pull in, e.g. the curl_cffi range of yt-dlp[curl-cffi].
    for extra in req.extras:
        for raw in requires(req.name) or []:
            dep = Requirement(raw)
            if dep.marker is not None and dep.marker.evaluate({"extra": extra}) and not dep.marker.evaluate({"extra": ""}):
                _check(Requirement(f"{dep.name}{dep.specifier}"), found, f"{req.name}[{extra}]")


def problems(requirements_file: Path) -> List[str]:
    found: List[str] = []
    for raw in requirements_file.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        try:
            req = Requirement(line)
        except InvalidRequirement as exc:
            found.append(f"{line}: {exc}")
            continue
        if req.marker is None or req.marker.evaluate():
            _check(req, found)
    return found


def main() -> int:
    found = problems(Path(sys.argv[1]))
    for problem in found:
        print(problem)
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
