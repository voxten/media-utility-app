"""Tests for backend.core.settings.validate_patch: what the window may change in the settings."""

import json
import re
import sys

import pytest

from backend.core.errors import AppError
from backend.core.settings import Settings, validate_patch


@pytest.mark.parametrize(
    "patch",
    [
        {"theme": "dark", "language": "en", "maxConcurrency": 1},
        {"cookies": {"youtube": "C:/cookies.txt"}},
        {"outputDir": "D:/Wyniki ąę", "closeToTray": False, "customFfmpegPath": ""},
        {"gifOutput": {"format": "gif", "lossy": 30}, "transcribe": {"model": "base"}, "downloadSubtitles": "auto"},
        {"clipboardLastLink": "https://x.com/a/status/1", "lastSeenVersion": "0.13.0", "engineUpdateCheck": False},
        {"backdrop": "micaAlt", "animations": False},
        {"accent": "system"},
        {"accent": "#0f6cbd"},
    ],
)
def test_changes_the_ui_makes_are_accepted(patch):
    assert validate_patch(patch) == patch


@pytest.mark.parametrize(
    "patch, key",
    [
        ({"engineLatest": {"yt-dlp": {"version": "2020.1.1"}}}, "engineLatest"),
        ({"engineLastCheck": 0}, "engineLastCheck"),
        ({"trayHintShown": True}, "trayHintShown"),
        ({"recentFolders": ["C:/"]}, "recentFolders"),
        ({"pythonPath": "C:/evil"}, "pythonPath"),
        ({"cookies": {"bank": "x"}}, "cookies.bank"),
        ({"cookies": {"youtube": 5}}, "cookies.youtube"),
        ({"cookies": "x"}, "cookies"),
        ({"maxConcurrency": True}, "maxConcurrency"),
        ({"maxConcurrency": "4"}, "maxConcurrency"),
        ({"maxConcurrency": 0}, "maxConcurrency"),
        ({"maxConcurrency": 999}, "maxConcurrency"),
        ({"closeToTray": 1}, "closeToTray"),
        ({"theme": "neon"}, "theme"),
        ({"downloadSubtitles": "all"}, "downloadSubtitles"),
        ({"gifOutput": "big"}, "gifOutput"),
        ({"backdrop": "acrylic"}, "backdrop"),
        ({"mica": True}, "mica"),
        ({"animations": 0}, "animations"),
        ({"accent": "red"}, "accent"),
        ({"accent": "#12345"}, "accent"),
        ({"accent": "#0f6cbd; x"}, "accent"),
        ({"accent": 5}, "accent"),
    ],
)
def test_other_changes_are_refused(patch, key):
    with pytest.raises(ValueError, match=key.replace(".", r"\.")):
        validate_patch(patch)


def test_custom_ffmpeg_must_be_ffmpeg_or_its_folder(tmp_path):
    name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
    folder = tmp_path / "ffmpeg bin"
    folder.mkdir()
    (folder / "evil.exe").write_bytes(b"")

    for bad in [folder, folder / "evil.exe", tmp_path / "missing" / name]:
        with pytest.raises(AppError, match="errors.ffmpegPathInvalid"):
            validate_patch({"customFfmpegPath": str(bad)})

    (folder / name).write_bytes(b"")
    for good in [folder, folder / name]:
        assert validate_patch({"customFfmpegPath": str(good)})


def test_backend_writes_are_not_restricted(tmp_path):
    settings = Settings(tmp_path / "settings.json")
    settings.update({"engineLatest": {"yt-dlp": {"version": "1"}}, "trayHintShown": True})
    assert settings.get("trayHintShown") is True


@pytest.mark.parametrize("mica, backdrop", [(True, "mica"), (False, "none")])
def test_old_mica_switch_becomes_the_backdrop(tmp_path, mica, backdrop):
    path = tmp_path / "settings.json"
    path.write_text(json.dumps({"mica": mica}), encoding="utf-8")
    settings = Settings(path)
    assert settings.get("backdrop") == backdrop
    assert "mica" not in settings.all()


def test_default_language_follows_the_system(monkeypatch, tmp_path):
    from backend.core import settings as settings_module

    monkeypatch.setattr(settings_module, "system_language", lambda: "en")
    assert settings_module.Settings(path=tmp_path / "s.json").get("language") == "en"


def test_windows_accent_is_a_hex_colour_or_nothing():
    from backend.core import win_theme

    accent = win_theme.system_accent()
    assert accent is None or re.fullmatch(r"#[0-9a-f]{6}", accent)
