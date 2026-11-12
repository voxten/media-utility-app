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


def test_install_into_a_chosen_folder_without_dependencies(frozen, tmp_path, monkeypatch):
    target = tmp_path / "engines" / "yt-dlp.new"
    cmd = addons.pip_install_command(["yt-dlp==2099.1.1"], target=target, no_deps=True)
    assert cmd[cmd.index("--target") + 1] == str(target)
    assert "--no-deps" in cmd
    assert target.is_dir()

    monkeypatch.delattr(sys, "frozen", raising=False)
    cmd = addons.pip_install_command(["yt-dlp==2099.1.1"], target=target, no_deps=True)
    assert cmd[:4] == [sys.executable, "-m", "pip", "install"]
    assert cmd[cmd.index("--target") + 1] == str(target)
    assert "--no-deps" in cmd


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


def test_a_staged_install_replaces_packages_and_their_old_metadata(tmp_path):
    folder, staged = tmp_path / "addons", tmp_path / "staged"
    (folder / "torch").mkdir(parents=True)
    (folder / "torch" / "old.py").write_text("old")
    (folder / "torch-2.5.0.dist-info").mkdir()
    (folder / "numpy").mkdir()
    (staged / "torch").mkdir(parents=True)
    (staged / "torch" / "new.py").write_text("new")
    (staged / "torch-2.6.0.dist-info").mkdir()

    addons.merge_staged(staged, folder)

    assert sorted(p.name for p in folder.iterdir()) == ["numpy", "torch", "torch-2.6.0.dist-info"]
    assert [p.name for p in (folder / "torch").iterdir()] == ["new.py"]


def _slow_pip(marker):
    """A pip stand-in that creates a package in its target folder, then stays silent."""
    script = (
        "import pathlib, sys, time\n"
        "target = pathlib.Path(sys.argv[sys.argv.index('--target') + 1])\n"
        "(target / 'torch').mkdir(parents=True)\n"
        f"pathlib.Path({str(marker)!r}).write_text('started')\n"
        "time.sleep(60)\n"
    )
    return lambda packages, target=None, no_deps=False: [sys.executable, "-c", script, "--target", str(target)]


def test_cancelled_install_stops_at_once_and_keeps_the_working_addons(frozen, monkeypatch, tmp_path, ctx):
    import threading
    import time

    from backend.core.jobs import JobCancelled
    from backend.services import deps_installer

    (frozen / "torch").mkdir(parents=True)
    (frozen / "torch" / "working.py").write_text("ok")
    marker = tmp_path / "started.txt"
    monkeypatch.setattr(deps_installer, "pip_install_command", _slow_pip(marker))

    def cancel_once_started():
        while not marker.exists():
            time.sleep(0.05)
        ctx.cancel()

    threading.Thread(target=cancel_once_started, daemon=True).start()
    started = time.monotonic()
    with pytest.raises(JobCancelled):
        deps_installer._run_pip(ctx, ["torch"])

    assert time.monotonic() - started < 10
    assert [p.name for p in (frozen / "torch").iterdir()] == ["working.py"]
    assert not addons.staging_dir().exists()
