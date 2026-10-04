from pathlib import Path
import os
import pytest

from backend.core.settings import Settings, default_settings
from backend.core import deps
from backend.services import system_info


def test_default_settings_keys():
    defaults = default_settings()
    expected_keys = {
        "theme",
        "language",
        "mica",
        "outputDir",
        "cookies",
        "recentFolders",
        "hardwareAcceleration",
        "maxConcurrency",
        "desktopNotifications",
        "completionSound",
        "customFfmpegPath",
        "confirmExitOnActiveJobs",
    }
    assert expected_keys.issubset(defaults.keys())
    assert defaults["hardwareAcceleration"] is True
    assert defaults["desktopNotifications"] is True
    assert defaults["completionSound"] is True
    assert defaults["customFfmpegPath"] == ""
    assert isinstance(defaults["maxConcurrency"], int)


def test_settings_reset_and_clear_recent(tmp_path):
    settings_file = tmp_path / "settings.json"
    s = Settings(path=settings_file)
    s.update({"theme": "dark", "maxConcurrency": 12, "customFfmpegPath": "C:\\custom\\ffmpeg.exe"})
    s.add_recent_folder("C:\\test\\folder1")
    s.add_recent_folder("C:\\test\\folder2")

    assert len(s.get("recentFolders")) == 2
    assert s.get("theme") == "dark"
    assert s.get("maxConcurrency") == 12

    # Clear recent
    s.clear_recent_folders()
    assert s.get("recentFolders") == []
    assert s.get("theme") == "dark"

    # Reset
    reset_data = s.reset()
    assert reset_data["theme"] == "system"
    assert reset_data["customFfmpegPath"] == ""


def test_ensure_app_paths_with_custom_ffmpeg(tmp_path, monkeypatch):
    custom_ffmpeg = tmp_path / "custom_bin" / "ffmpeg.exe"
    custom_ffmpeg.parent.mkdir(parents=True, exist_ok=True)
    custom_ffmpeg.write_bytes(b"")

    monkeypatch.setenv("PATH", "C:\\Windows")
    deps.ensure_app_paths(str(custom_ffmpeg))
    assert str(custom_ffmpeg.parent) in os.environ["PATH"]


def test_storage_info(tmp_path, monkeypatch):
    monkeypatch.setattr(system_info, "app_data_dir", lambda: tmp_path)
    monkeypatch.setattr(system_info, "cache_dir", lambda: tmp_path / "cache")

    cache_dir = tmp_path / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / "temp1.bin").write_bytes(b"12345")
    (cache_dir / "temp2.bin").write_bytes(b"67890")

    models_dir = tmp_path / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    (models_dir / "model.pt").write_bytes(b"abcdefgh")

    info = system_info.get_storage_info()
    assert info["cacheBytes"] == 10
    assert info["cacheFiles"] == 2
    assert info["modelsBytes"] == 8
    assert info["modelsFiles"] == 1
    assert info["totalAppDataBytes"] >= 18


def test_clear_cache(tmp_path, monkeypatch):
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    test_file = cache_dir / "preview.png"
    test_file.write_bytes(b"png_dummy_data")

    sub_dir = cache_dir / "sub"
    sub_dir.mkdir(parents=True, exist_ok=True)
    (sub_dir / "nested.tmp").write_bytes(b"123")

    monkeypatch.setattr(system_info, "cache_dir", lambda: cache_dir)

    res = system_info.clear_cache()
    assert res["success"] is True
    assert res["filesDeleted"] >= 2
    assert res["freedBytes"] >= 17
    assert not test_file.exists()
    assert not sub_dir.exists()


def test_hardware_info():
    info = system_info.get_hardware_info()
    assert "cpuName" in info
    assert "cpuThreads" in info
    assert info["cpuThreads"] >= 1
    assert "cpuArchitecture" in info
    assert "gpus" in info
    assert isinstance(info["gpus"], list)
    assert "cudaAvailable" in info
    assert "ramTotalBytes" in info
