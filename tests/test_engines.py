"""Tests for backend.core.engines and the engine update job: newer yt-dlp / gallery-dl from Settings."""

import json
import sys
from pathlib import Path

import pytest

from backend.core import engines
from backend.core.settings import Settings
from backend.services import deps_installer


def _fake_dist(folder: Path, name: str, version: str) -> None:
    info = folder / f"{name.replace('-', '_')}-{version}.dist-info"
    info.mkdir(parents=True)
    (info / "METADATA").write_text(f"Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n", encoding="utf-8")


@pytest.fixture
def engines_root(monkeypatch, tmp_path):
    root = tmp_path / "engines"
    monkeypatch.setenv(engines.ENGINES_DIR_ENV, str(root))
    monkeypatch.setattr(sys, "path", list(sys.path))
    monkeypatch.setattr(engines, "_in_use", {})
    return root


@pytest.fixture
def settings(tmp_path):
    return Settings(tmp_path / "settings.json")


def _pypi(versions):
    def fetch(name):
        if isinstance(versions[name], Exception):
            raise versions[name]
        version, requires = versions[name]
        return {"info": {"version": version, "requires_dist": requires}}

    return fetch


def test_versions_compare_as_numbers():
    assert engines.version_tuple("2026.08.19") == engines.version_tuple("2026.8.19")
    assert engines.is_newer("2026.10.26", "2026.8.19")
    assert engines.is_newer("1.32.20", "1.32.19")
    assert not engines.is_newer("1.32.19", "1.32.19")
    assert not engines.is_newer(None, "1.0")
    assert engines.is_newer("1.0", None)


def test_only_a_newer_download_goes_first_on_sys_path(engines_root):
    _fake_dist(engines_root / "yt-dlp", "yt-dlp", "2099.1.1")
    _fake_dist(engines_root / "gallery-dl", "gallery-dl", "0.0.1")

    engines.activate_engines()
    engines.activate_engines()

    assert sys.path[0] == str(engines_root / "yt-dlp")
    assert sys.path.count(str(engines_root / "yt-dlp")) == 1
    assert str(engines_root / "gallery-dl") not in sys.path
    assert engines._in_use["yt-dlp"] == "2099.1.1"
    assert engines._in_use["gallery-dl"] == engines.bundled_version("gallery-dl")


def test_bundled_version_ignores_downloaded_copies(engines_root):
    bundled = engines.bundled_version("yt-dlp")
    _fake_dist(engines_root / "yt-dlp", "yt-dlp", "2099.1.1")
    engines.activate_engines()
    assert engines.bundled_version("yt-dlp") == bundled
    assert engines.downloaded_version("yt-dlp") == "2099.1.1"


def test_an_install_during_this_run_needs_a_restart(engines_root, settings):
    engines.activate_engines()
    _fake_dist(engines_root / "yt-dlp", "yt-dlp", "2099.1.1")

    item = next(e for e in engines.status(settings) if e["id"] == "yt-dlp")

    assert item["version"] == engines.bundled_version("yt-dlp")
    assert item["restartRequired"] and item["downloaded"]


def test_check_updates_remembers_latest_versions_and_pins(engines_root, settings):
    fetch = _pypi({
        "yt-dlp": ("2099.1.1", ["yt-dlp-ejs==0.9.1; extra == 'default'", "yt-dlp-ejs==0.9.1; extra == 'pin'", "certifi"]),
        "gallery-dl": ("0.0.1", ["requests>=2.11.0"]),
    })

    result = {e["id"]: e for e in engines.check_updates(settings, fetch)}

    assert result["yt-dlp"]["updateAvailable"] and result["yt-dlp"]["latest"] == "2099.1.1"
    assert not result["gallery-dl"]["updateAvailable"]
    latest = settings.get("engineLatest")
    assert latest["yt-dlp"]["pins"] == {"yt-dlp-ejs": "0.9.1"}
    assert settings.get("engineLastCheck") > 0
    assert engines.install_specs(engines.get_engine("yt-dlp"), latest["yt-dlp"]) == ["yt-dlp==2099.1.1", "yt-dlp-ejs==0.9.1"]


def test_check_updates_tolerates_one_unreachable_package(engines_root, settings):
    fetch = _pypi({"yt-dlp": ("2099.1.1", []), "gallery-dl": OSError("offline")})
    result = {e["id"]: e for e in engines.check_updates(settings, fetch)}
    assert result["yt-dlp"]["updateAvailable"]
    assert result["gallery-dl"]["latest"] is None


def test_check_updates_fails_when_offline(engines_root, settings):
    with pytest.raises(OSError):
        engines.check_updates(settings, _pypi({"yt-dlp": OSError("offline"), "gallery-dl": OSError("offline")}))
    assert settings.get("engineLastCheck") == 0


def test_auto_check_runs_at_most_daily_and_can_be_turned_off(settings):
    assert engines.auto_check_due(settings, now=1_000_000)
    settings.update({"engineLastCheck": 1_000_000})
    assert not engines.auto_check_due(settings, now=1_000_000 + 3600)
    assert engines.auto_check_due(settings, now=1_000_000 + engines.CHECK_INTERVAL_S)
    settings.update({"engineUpdateCheck": False})
    assert not engines.auto_check_due(settings, now=9_999_999)


def _update_ready(settings, version="2099.1.1"):
    settings.update({"engineLatest": {"yt-dlp": {"version": version, "pins": {"yt-dlp-ejs": "0.9.1"}}}})


def test_update_installs_into_staging_and_swaps_it_in(engines_root, settings, ctx, monkeypatch):
    _fake_dist(engines_root / "yt-dlp", "yt-dlp", "2098.1.1")
    _update_ready(settings)
    calls = []

    def fake_pip(_ctx, packages, target=None, no_deps=False):
        calls.append((packages, target, no_deps))
        _fake_dist(target, "yt-dlp", "2099.1.1")

    monkeypatch.setattr(deps_installer, "_run_pip", fake_pip)
    monkeypatch.setattr(deps_installer, "_verify_engine", lambda engine_id, folder: None)

    result = deps_installer.update_engines(ctx, settings)

    assert result["updated"] == ["yt-dlp"]
    assert calls == [(["yt-dlp==2099.1.1", "yt-dlp-ejs==0.9.1"], engines.staging_dir("yt-dlp"), True)]
    assert engines.downloaded_version("yt-dlp") == "2099.1.1"
    assert sorted(p.name for p in engines_root.iterdir()) == ["yt-dlp"]


def test_a_copy_that_fails_verification_is_thrown_away(engines_root, settings, ctx, monkeypatch):
    _fake_dist(engines_root / "yt-dlp", "yt-dlp", "2098.1.1")
    _update_ready(settings)
    monkeypatch.setattr(deps_installer, "_run_pip", lambda _ctx, packages, target=None, no_deps=False: _fake_dist(target, "yt-dlp", "2099.1.1"))

    def broken(engine_id, folder):
        raise RuntimeError("yt-dlp: ImportError: curl_cffi too old")

    monkeypatch.setattr(deps_installer, "_verify_engine", broken)

    with pytest.raises(RuntimeError, match="curl_cffi"):
        deps_installer.update_engines(ctx, settings)

    assert engines.downloaded_version("yt-dlp") == "2098.1.1"
    assert not engines.staging_dir("yt-dlp").exists()


def test_reset_brings_back_the_bundled_engines(engines_root, settings):
    _fake_dist(engines_root / "yt-dlp", "yt-dlp", "2099.1.1")
    engines.reset()
    assert engines.downloaded_version("yt-dlp") is None
    assert not any(e["downloaded"] for e in engines.status(settings))


def _fake_gallery_dl(folder: Path, broken: bool = False) -> None:
    pkg = folder / "gallery_dl"
    (pkg / "extractor").mkdir(parents=True)
    for name in ("__init__.py", "config.py", "exception.py", "extractor/__init__.py"):
        (pkg / name).write_text("", encoding="utf-8")
    (pkg / "extractor" / "instagram.py").write_text("import not_a_real_module\n" if broken else "", encoding="utf-8")


def test_check_process_accepts_a_copy_that_imports(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "path", list(sys.path))
    monkeypatch.setattr(sys, "modules", dict(sys.modules))
    for name in [m for m in sys.modules if m.split(".")[0] == "gallery_dl"]:
        del sys.modules[name]
    _fake_gallery_dl(tmp_path / "new")
    report = tmp_path / "report.json"

    assert engines.run_check_main(["gallery-dl", str(tmp_path / "new"), str(report)]) == 0
    assert json.loads(report.read_text(encoding="utf-8")) == {"ok": True}


def test_check_process_rejects_a_copy_that_fails_to_import(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "path", list(sys.path))
    monkeypatch.setattr(sys, "modules", dict(sys.modules))
    for name in [m for m in sys.modules if m.split(".")[0] == "gallery_dl"]:
        del sys.modules[name]
    _fake_gallery_dl(tmp_path / "new", broken=True)
    report = tmp_path / "report.json"

    assert engines.run_check_main(["gallery-dl", str(tmp_path / "new"), str(report)]) == 1
    result = json.loads(report.read_text(encoding="utf-8"))
    assert not result["ok"] and "not_a_real_module" in result["error"]


def test_check_process_rejects_a_module_loaded_from_elsewhere(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "path", list(sys.path))
    import yt_dlp  # noqa: F401 - already imported, so the empty folder cannot provide it

    report = tmp_path / "report.json"
    assert engines.run_check_main(["yt-dlp", str(tmp_path), str(report)]) == 1
    assert "not from the new copy" in json.loads(report.read_text(encoding="utf-8"))["error"]
