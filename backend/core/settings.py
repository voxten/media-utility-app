"""Persistent user settings stored as JSON in the per-user app data directory."""

import copy
import json
import os
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
        "cookies": {"youtube": "", "x": ""},
        "recentFolders": [],
        "hardwareAcceleration": True,
        "maxConcurrency": min(4, os.cpu_count() or 4),
        "desktopNotifications": True,
        "completionSound": True,
        "customFfmpegPath": "",
        "confirmExitOnActiveJobs": True,
    }


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
