import importlib.util
from pathlib import Path
from types import SimpleNamespace

from packaging.requirements import Requirement

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "check_requirements.py"
spec = importlib.util.spec_from_file_location("check_requirements", SCRIPT)
check_requirements = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check_requirements)


def _fake_environment(monkeypatch, tree):
    monkeypatch.setattr(
        check_requirements, "distribution",
        lambda name: SimpleNamespace(metadata={"Name": name}, version="1.0"),
    )
    monkeypatch.setattr(
        check_requirements, "_dependencies",
        lambda name, extras: iter(Requirement(dep) for dep in tree.get(name, [])),
    )


def test_a_package_needed_without_a_marker_stays_unmarked(monkeypatch, tmp_path):
    marker = f'sys_platform == "{__import__("sys").platform}"'
    tree = {"winrt-runtime": ["typing_extensions"], "pydantic": ["typing_extensions", "annotated-types"],
            "typing_extensions": ["helper"]}
    _fake_environment(monkeypatch, tree)
    for order in (["pydantic", f"winrt-runtime; {marker}"], [f"winrt-runtime; {marker}", "pydantic"]):
        requirements = tmp_path / "requirements.txt"
        requirements.write_text("\n".join(order) + "\n", encoding="utf-8")
        pins = check_requirements.resolved(requirements)
        assert pins["typing-extensions"] == "typing_extensions==1.0"
        assert pins["helper"] == "helper==1.0"
        assert pins["winrt-runtime"] == f"winrt-runtime==1.0; {marker}"
