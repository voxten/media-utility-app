"""Health check of optional native/external dependencies shown on the Settings page."""

import importlib.util
import shutil
from typing import Any, Dict, List


def _has_module(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def _mediainfo_ok() -> bool:
    try:
        from pymediainfo import MediaInfo

        return bool(MediaInfo.can_parse())
    except Exception:  # noqa: BLE001 - missing native library raises various errors
        return False


def check_dependencies() -> List[Dict[str, Any]]:
    ffmpeg = shutil.which("ffmpeg")
    return [
        {
            "id": "ffmpeg",
            "ok": ffmpeg is not None,
            "detail": ffmpeg or "",
            "usedBy": ["download", "tts"],
            "required": True,
        },
        {
            "id": "mediainfo",
            "ok": _mediainfo_ok(),
            "detail": "",
            "usedBy": ["duplicates"],
            "required": True,
        },
        {
            "id": "lama",
            "ok": _has_module("iopaint") and _has_module("torch"),
            "detail": "pip install iopaint torch torchvision",
            "usedBy": ["watermark"],
            "required": False,
        },
    ]
