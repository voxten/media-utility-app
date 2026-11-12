"""Exit 1 when the running environment does not satisfy a requirements file.

    python scripts/check_requirements.py requirements.txt
    python scripts/check_requirements.py --lock requirements.lock    # exit 2 when versions differ
    python scripts/check_requirements.py --write-lock requirements.txt requirements.lock

Run with the interpreter that builds the app (scripts/build.py does), so the bundle never
ships without a package or with a version requirements.txt rules out.

The lock pins every package requirements.txt pulls in, at the versions a release was built
with; dev tools and the optional AI add-ons stay out of it because requirements.txt does.
"""

import sys
from importlib.metadata import PackageNotFoundError, distribution, requires, version
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Set

from packaging.markers import Marker
from packaging.requirements import InvalidRequirement, Requirement
from packaging.utils import canonicalize_name


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


def _requirements(requirements_file: Path) -> Iterator[Requirement]:
    for raw in requirements_file.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        yield Requirement(line)


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


def _dependencies(name: str, extras: Set[str]) -> Iterator[Requirement]:
    for raw in requires(name) or []:
        dep = Requirement(raw)
        if dep.marker is None or any(dep.marker.evaluate({"extra": extra}) for extra in extras | {""}):
            yield dep


def resolved(requirements_file: Path) -> Dict[str, str]:
    """Installed name → "name==version[; marker]" for requirements_file and everything it pulls in."""
    pins: Dict[str, str] = {}
    markers: Dict[str, Optional[Marker]] = {}
    pending = [(req, req.marker) for req in _requirements(requirements_file)]
    seen: Set[tuple] = set()
    while pending:
        req, marker = pending.pop()
        if marker is not None and not marker.evaluate({"extra": ""}):
            continue
        key = canonicalize_name(req.name)
        extras = frozenset(req.extras)
        if (key, extras) in seen:
            continue
        seen.add((key, extras))
        try:
            dist = distribution(req.name)
        except PackageNotFoundError:
            continue
        if key not in markers or marker is None:
            markers[key] = marker
        pins[key] = f"{dist.metadata['Name']}=={dist.version}"
        pending += [(dep, marker) for dep in _dependencies(req.name, set(extras))]
    return {key: pin + (f"; {markers[key]}" if markers[key] is not None else "") for key, pin in pins.items()}


def write_lock(requirements_file: Path, lock_file: Path) -> None:
    lines = [
        f"# Exact versions the release is built with: everything {requirements_file.name} pulls in.",
        "# Regenerate: python scripts/check_requirements.py --write-lock requirements.txt requirements.lock",
        "# scripts/build.py warns when the build environment differs from this file.",
        *sorted(resolved(requirements_file).values(), key=str.lower),
    ]
    lock_file.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def lock_differences(lock_file: Path) -> List[str]:
    found: List[str] = []
    for req in _requirements(lock_file):
        if req.marker is not None and not req.marker.evaluate():
            continue
        try:
            installed = version(req.name)
        except PackageNotFoundError:
            found.append(f"{req.name}: not installed, lock has {req.specifier}")
            continue
        if not req.specifier.contains(installed, prereleases=True):
            found.append(f"{req.name}: {installed} installed, lock has {req.specifier}")
    return found


def main(argv: List[str]) -> int:
    if argv[:1] == ["--write-lock"]:
        write_lock(Path(argv[1]), Path(argv[2]))
        return 0
    if argv[:1] == ["--lock"]:
        found = lock_differences(Path(argv[1]))
        for difference in found:
            print(difference)
        return 2 if found else 0
    found = problems(Path(argv[0]))
    for problem in found:
        print(problem)
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
