"""Health check of optional native/external dependencies shown on the Settings page."""

import importlib.util
import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.core.paths import app_data_dir, project_root

LAMA_EXPECTED_SIZE = 205669692
LAMA_EXPECTED_MD5 = "e3aa4aaa15225a33ec84f9f4bc47e500"


def _has_module(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def ensure_app_paths(custom_ffmpeg: Optional[str] = None) -> None:
    """Ensure custom binaries and portable binaries in %APPDATA%\\MediaStudio\\bin are on PATH."""
    current_path = os.environ.get("PATH", "")
    paths_to_add: List[str] = []
    if custom_ffmpeg:
        cfp = Path(custom_ffmpeg)
        cdir = cfp if cfp.is_dir() else cfp.parent
        if cdir.is_dir():
            paths_to_add.append(str(cdir))
    bin_dir = app_data_dir() / "bin"
    if bin_dir.is_dir():
        paths_to_add.append(str(bin_dir))
    for p in paths_to_add:
        if p not in current_path.split(os.pathsep):
            current_path = p + os.pathsep + current_path
    os.environ["PATH"] = current_path


def lama_model_path() -> Optional[Path]:
    """Finds the LaMa model weights file if present."""
    candidates = [
        app_data_dir() / "models" / "big-lama.pt",
        Path.home() / ".cache" / "torch" / "hub" / "checkpoints" / "big-lama.pt",
        project_root() / "models" / "big-lama.pt",
    ]
    for p in candidates:
        if p.is_file() and p.stat().st_size > 100_000_000:
            return p
    return None


def is_lama_ready() -> bool:
    """True if PyTorch is installed and either big-lama.pt exists or IOPaint is present."""
    if not _has_module("torch"):
        return False
    if lama_model_path() is not None:
        return True
    return _has_module("iopaint")


def upscale_model_path(model_id: str) -> Optional[Path]:
    """Finds downloaded Real-ESRGAN weights if present."""
    filename = "realesr-general-x4v3.pth" if model_id == "general" else "RealESRGAN_x4plus_anime_6B.pth"
    candidates = [
        app_data_dir() / "models" / filename,
        Path.home() / ".cache" / "torch" / "hub" / "checkpoints" / filename,
        project_root() / "models" / filename,
    ]
    for p in candidates:
        if p.is_file() and p.stat().st_size > 1_000_000:
            return p
    return None


def is_upscale_ready(model_id: str) -> bool:
    return _has_module("torch") and upscale_model_path(model_id) is not None


def is_rembg_ready() -> bool:
    return _has_module("rembg") and _has_module("onnxruntime")


def _mediainfo_ok() -> bool:
    try:
        from pymediainfo import MediaInfo

        return bool(MediaInfo.can_parse())
    except Exception:  # noqa: BLE001 - missing native library raises various errors
        return False


def check_dependencies(custom_ffmpeg: Optional[str] = None) -> List[Dict[str, Any]]:
    ensure_app_paths(custom_ffmpeg)
    ffmpeg = shutil.which("ffmpeg")
    ffmpeg_ok = ffmpeg is not None

    lama_ok = is_lama_ready()
    has_torch = _has_module("torch")

    if lama_ok:
        lama_detail = "Model AI LaMa (big-lama.pt)"
        lama_size = ""
    elif has_torch:
        lama_detail = "settings.deps.detailLamaModelOnly"
        lama_size = "~196 MB"
    else:
        lama_detail = "settings.deps.detailLamaFull"
        lama_size = "~320 MB"

    upscale_gen_ok = is_upscale_ready("general")
    upscale_anime_ok = is_upscale_ready("anime")
    rembg_ok = is_rembg_ready()

    return [
        {
            "id": "ffmpeg",
            "ok": ffmpeg_ok,
            "detail": ffmpeg or "settings.deps.detailFfmpegMissing",
            "usedBy": ["download", "tts"],
            "required": True,
            "installable": not ffmpeg_ok,
            "sizeEstimate": "~35 MB" if not ffmpeg_ok else "",
        },
        {
            "id": "mediainfo",
            "ok": _mediainfo_ok(),
            "detail": "",
            "usedBy": ["duplicates"],
            "required": True,
            "installable": False,
            "sizeEstimate": "",
        },
        {
            "id": "lama",
            "ok": lama_ok,
            "detail": lama_detail,
            "usedBy": ["watermark"],
            "required": False,
            "installable": not lama_ok,
            "sizeEstimate": lama_size,
        },
        {
            "id": "rembg",
            "ok": rembg_ok,
            "detail": "BiRefNet / RMBG (rembg + onnxruntime)" if rembg_ok else "settings.deps.detailRembgMissing",
            "usedBy": ["rembg"],
            "required": False,
            "installable": not rembg_ok,
            "sizeEstimate": "~140 MB" if not rembg_ok else "",
        },
        {
            "id": "upscale_general",
            "ok": upscale_gen_ok,
            "detail": "Real-ESRGAN General (realesr-general-x4v3)" if upscale_gen_ok else "settings.deps.detailUpscaleGenMissing",
            "usedBy": ["upscale"],
            "required": False,
            "installable": not upscale_gen_ok,
            "sizeEstimate": "~4.8 MB" if not upscale_gen_ok else "",
        },
        {
            "id": "upscale_anime",
            "ok": upscale_anime_ok,
            "detail": "Real-ESRGAN Anime (anime_6B)" if upscale_anime_ok else "settings.deps.detailUpscaleAnimeMissing",
            "usedBy": ["upscale"],
            "required": False,
            "installable": not upscale_anime_ok,
            "sizeEstimate": "~17.9 MB" if not upscale_anime_ok else "",
        },
    ]

