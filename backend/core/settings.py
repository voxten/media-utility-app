"""Persistent user settings stored as JSON in the per-user app data directory."""

import copy
import json
import os
import sys
import threading
from pathlib import Path
from typing import Any, Dict, Optional

from backend.core.paths import app_data_dir, default_output_dir, resource_path

MAX_RECENT = 8

# Default cookie files: project cookies/ dir, app data dir, or legacy fallback.
DEFAULT_COOKIES = {
    "youtube": [
        resource_path("cookies", "youtube_cookies.txt"),
        app_data_dir() / "cookies" / "youtube_cookies.txt",
        resource_path("features", "download", "youtube_cookies.txt"),
    ],
    "x": [
        resource_path("cookies", "x.com_cookies.txt"),
        resource_path("cookies", "x_cookies.txt"),
        app_data_dir() / "cookies" / "x.com_cookies.txt",
        resource_path("features", "download", "x.com_cookies.txt"),
    ],
    "instagram": [
        resource_path("cookies", "instagram_cookies.txt"),
        app_data_dir() / "cookies" / "instagram_cookies.txt",
    ],
}
LEGACY_COOKIES = {
    "youtube": resource_path("cookies", "youtube_cookies.txt"),
    "x": resource_path("cookies", "x.com_cookies.txt"),
}


def default_settings() -> Dict[str, Any]:
    return {
        "theme": "system",  # system | light | dark
        "language": "pl",  # pl | en
        "mica": True,  # Windows 11 backdrop; applied on next start
        "outputDir": str(default_output_dir()),
        "cookies": {"youtube": "", "x": "", "instagram": ""},
        "recentFolders": [],
        "maxConcurrency": min(4, os.cpu_count() or 4),
        "desktopNotifications": True,
        "completionSound": True,
        "customFfmpegPath": "",
        "confirmExitOnActiveJobs": True,
        "closeToTray": True,  # X hides the window; the app keeps running in the notification area
        "trayHintShown": False,  # the one-time "still running in the background" notification
        "clipboardWatch": False,  # offer a copied video link when the window is activated
        "clipboardLastLink": "",  # the last link offered, so it is not offered again
        "lastSeenVersion": "",  # app version whose release notes the user was pointed to
        "downloadEmbedMeta": True,  # cover image, title and artist written into downloaded files
        "downloadSkipArchived": False,  # queued links already downloaded once are skipped
        "engineUpdateCheck": True,  # look for newer yt-dlp / gallery-dl at start-up, at most daily
        "engineLastCheck": 0,  # time.time() of the last look
        "engineLatest": {},  # {"yt-dlp": {"version": …, "pins": {"yt-dlp-ejs": …}}, …}
    }


# Written by the app itself; the window may read them but never change them. engineLatest decides
# which engine version pip installs, so a forged one could install an old or vulnerable release.
INTERNAL_KEYS = frozenset({"recentFolders", "trayHintShown", "engineLastCheck", "engineLatest"})
# Options the tools remember between runs; they have no default and only the window reads them.
TOOL_OPTION_TYPES: Dict[str, type] = {"gifOutput": dict, "transcribe": dict, "downloadSubtitles": str}
CHOICES: Dict[str, frozenset] = {
    "theme": frozenset({"system", "light", "dark"}),
    "language": frozenset({"pl", "en"}),
    "downloadSubtitles": frozenset({"off", "site", "auto"}),
}
MAX_CONCURRENCY = 16


def _check_type(key: str, value: Any, expected: type) -> None:
    # bool is an int in Python, so True must not pass for a number (or the other way round).
    if isinstance(value, bool) != (expected is bool) or not isinstance(value, expected):
        raise ValueError(f"Setting {key} must be {expected.__name__}")


def _ffmpeg_folder_ok(path: str) -> bool:
    """The custom FFmpeg path only puts its folder first on PATH, so that folder must hold FFmpeg."""
    if not path:
        return True
    target = Path(path)
    folder = target if target.is_dir() else target.parent
    name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
    return (folder / name).is_file() and (target.is_dir() or target.name.lower() == name)


def validate_patch(patch: Any) -> Dict[str, Any]:
    """Check a settings change sent by the window: known keys, matching types, allowed values.

    Raises ValueError naming the first offending key; nothing is applied in that case.
    """
    if not isinstance(patch, dict):
        raise ValueError("Settings patch must be an object")
    defaults = default_settings()
    for key, value in patch.items():
        if key in INTERNAL_KEYS or (key not in defaults and key not in TOOL_OPTION_TYPES):
            raise ValueError(f"Setting {key} cannot be changed")
        default = defaults.get(key)
        _check_type(key, value, TOOL_OPTION_TYPES.get(key) or type(default))
        if key in CHOICES and value not in CHOICES[key]:
            raise ValueError(f"Setting {key} has an unknown value")
        if isinstance(default, dict):
            for name, item in value.items():
                if name not in default:
                    raise ValueError(f"Setting {key}.{name} cannot be changed")
                _check_type(f"{key}.{name}", item, type(default[name]))
    if "maxConcurrency" in patch and not 1 <= patch["maxConcurrency"] <= MAX_CONCURRENCY:
        raise ValueError("Setting maxConcurrency is out of range")
    if not _ffmpeg_folder_ok(patch.get("customFfmpegPath", "")):
        raise ValueError("Setting customFfmpegPath must point to ffmpeg")
    return patch


def _merge(defaults: Dict[str, Any], stored: Dict[str, Any]) -> Dict[str, Any]:
    merged = copy.deepcopy(defaults)
    for key, value in stored.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge(merged[key], value)
        else:
            merged[key] = value
    return merged


class Settings:
    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path or app_data_dir() / "settings.json"
        self._lock = threading.Lock()
        self._data = self._load()

    def _load(self) -> Dict[str, Any]:
        try:
            stored = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(stored, dict):
                return _merge(default_settings(), stored)
        except (OSError, ValueError):
            pass
        return default_settings()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._data, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self.path)

    def all(self) -> Dict[str, Any]:
        with self._lock:
            return copy.deepcopy(self._data)

    def get(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return copy.deepcopy(self._data.get(key, default))

    def update(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        """Deep-merge ``patch`` into the settings, persist and return the new state."""
        with self._lock:
            self._data = _merge(self._data, patch)
            self._save()
            return copy.deepcopy(self._data)

    def add_recent_folder(self, folder: str) -> None:
        with self._lock:
            recent = [f for f in self._data.get("recentFolders", []) if f != folder]
            self._data["recentFolders"] = [folder, *recent][:MAX_RECENT]
            self._save()

    def clear_recent_folders(self) -> Dict[str, Any]:
        with self._lock:
            self._data["recentFolders"] = []
            self._save()
            return copy.deepcopy(self._data)

    def reset(self) -> Dict[str, Any]:
        with self._lock:
            self._data = default_settings()
            self._save()
            return copy.deepcopy(self._data)

    def cookie_files(self) -> Dict[str, Optional[str]]:
        """Resolved cookie file per site; configured path wins, default cookies/ directory is the fallback."""
        configured = self.get("cookies", {})
        result: Dict[str, Optional[str]] = {}
        for site, fallbacks in DEFAULT_COOKIES.items():
            candidate = configured.get(site) or ""
            if candidate and Path(candidate).is_file():
                result[site] = candidate
                continue
            found = None
            for p in fallbacks:
                if p.is_file():
                    found = str(p)
                    break
            result[site] = found
        return result
