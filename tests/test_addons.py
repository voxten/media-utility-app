"""Tests for backend.core.addons: where optional AI packages get installed and how they become importable."""

import sys

import pytest

from backend.core import addons


@pytest.fixture
def frozen(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setenv(addons.ADDONS_DIR_ENV, str(tmp_path / "addons"))
    return tmp_path / "addons"


def test_source_install_uses_the_running_interpreter(monkeypatch):
    monkeypatch.delattr(sys, "frozen", raising=False)
    cmd = addons.pip_install_command(["torch"])
    assert cmd[:4] == [sys.executable, "-m", "pip", "install"]
    assert "--target" not in cmd
    assert cmd[-1] == "torch"


def test_packaged_install_goes_through_the_app_into_the_addons_folder(frozen):
    cmd = addons.pip_install_command(["rembg[cpu]", "onnxruntime"])
    assert cmd[:3] == [sys.executable, addons.PIP_FLAG, "install"]
    assert cmd[cmd.index("--target") + 1] == str(frozen)
    assert "--only-binary=:all:" in cmd
    assert cmd[-2:] == ["rembg[cpu]", "onnxruntime"]
    assert frozen.is_dir()


def test_addons_folder_is_tied_to_the_python_version(monkeypatch):
    monkeypatch.delenv(addons.ADDONS_DIR_ENV, raising=False)
    assert addons.addons_dir().name == f"cp{sys.version_info.major}{sys.version_info.minor}"


def test_activate_adds_the_folder_after_bundled_packages(frozen, monkeypatch):
    (frozen / "demo_addon_pkg").mkdir(parents=True)
    (frozen / "demo_addon_pkg" / "__init__.py").write_text("VALUE = 42\n", encoding="utf-8")
    monkeypatch.setattr(sys, "path", list(sys.path))

    addons.activate_addons()
    addons.activate_addons()

    assert sys.path[-1] == str(frozen)
    assert sys.path.count(str(frozen)) == 1
    import demo_addon_pkg

    assert demo_addon_pkg.VALUE == 42
    sys.modules.pop("demo_addon_pkg", None)


def test_activate_does_nothing_when_running_from_source(monkeypatch, tmp_path):
    monkeypatch.delattr(sys, "frozen", raising=False)
    monkeypatch.setenv(addons.ADDONS_DIR_ENV, str(tmp_path))
    monkeypatch.setattr(sys, "path", list(sys.path))
    addons.activate_addons()
    assert str(tmp_path) not in sys.path


def test_pip_runs_in_process():
    assert addons.run_pip_main(["--version"]) == 0
