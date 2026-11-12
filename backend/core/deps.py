"""Health check of optional native/external dependencies shown on the Settings page."""

import importlib.util
import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, NamedTuple, Optional

from backend.core import whisper_models
from backend.core.paths import app_data_dir, models_dir, project_root

LAMA_EXPECTED_SIZE = 205669692
LAMA_EXPECTED_SHA256 = "344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9"


class RemBgModel(NamedTuple):
    file: str
    size: int
    sha256: str


REMBG_RELEASE_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/"
# rembg's own downloads check MD5 only and show no progress, so the app fetches these files itself.
REMBG_MODELS: Dict[str, RemBgModel] = {
    "birefnet-general": RemBgModel("BiRefNet-general-epoch_244.onnx", 972666916, "58f621f00f5d756097615970a88a791584600dcf7c45b18a0a6267535a1ebd3c"),
    "birefnet-general-lite": RemBgModel("BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx", 224005088, "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333"),
    "isnet-general-use": RemBgModel("isnet-general-use.onnx", 178648008, "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a"),
    "u2net": RemBgModel("u2net.onnx", 175997641, "8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491"),
}
DEFAULT_REMBG_MODEL = "birefnet-general"


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
        models_dir() / "big-lama.pt",
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
        models_dir() / filename,
        Path.home() / ".cache" / "torch" / "hub" / "checkpoints" / filename,
        project_root() / "models" / filename,
    ]
    for p in candidates:
        if p.is_file() and p.stat().st_size > 1_000_000:
            return p
    return None


def is_upscale_ready(model_id: str) -> bool:
    return _has_module("torch") and upscale_model_path(model_id) is not None


def rembg_model_path(name: str) -> Optional[Path]:
    """A complete copy of a background removal model where rembg finds it (``U2NET_HOME`` is
    ``models_dir()``): the flat file the app downloads, or the folder newer rembg versions use."""
    model = REMBG_MODELS.get(name)
    root = models_dir()
    for path in (root / f"{name}.onnx", root / "models" / name / f"{name}.onnx"):
        if path.is_file() and (model is None or path.stat().st_size == model.size):
            return path
    return None


def rembg_packages_ready() -> bool:
    return _has_module("rembg") and _has_module("onnxruntime")


def is_rembg_ready() -> bool:
    return rembg_packages_ready() and rembg_model_path(DEFAULT_REMBG_MODEL) is not None


def _mediainfo_ok() -> bool:
    try:
        from pymediainfo import MediaInfo

        return bool(MediaInfo.can_parse())
    except Exception:  # noqa: BLE001 - missing native library raises various errors
        return False


def _whisper_dependencies() -> List[Dict[str, Any]]:
    engine_ok = whisper_models.is_engine_installed()
    items = []
    for model in whisper_models.MODELS.values():
        ok = engine_ok and whisper_models.is_model_downloaded(model.id)
        size = model.size + (0 if engine_ok else whisper_models.ENGINE_SIZE_MB * 1_000_000)
        if ok:
            detail = f"faster-whisper · {model.repo.split('/')[-1]}"
        elif engine_ok:
            detail = "settings.deps.detailWhisperModelOnly"
        else:
            detail = "settings.deps.detailWhisperFull"
        items.append({
            "id": f"{whisper_models.DEP_PREFIX}{model.id}",
            "ok": ok,
            "detail": detail,
            "usedBy": ["transcribe", "download"],
            "required": False,
            "installable": not ok,
            "sizeEstimate": "" if ok else whisper_models.size_label(size),
        })
    return items


def check_dependencies(custom_ffmpeg: Optional[str] = None) -> List[Dict[str, Any]]:
    ensure_app_paths(custom_ffmpeg)
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    # Every video tool reads the file with ffprobe first, so FFmpeg alone is not enough.
    ffmpeg_ok = ffmpeg is not None and ffprobe is not None
    gifsicle = shutil.which("gifsicle")

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
    rembg_packages_ok = rembg_packages_ready()
    rembg_ok = rembg_packages_ok and rembg_model_path(DEFAULT_REMBG_MODEL) is not None
    rembg_detail = (
        "BiRefNet (rembg + onnxruntime)"
        if rembg_ok
        else "settings.deps.detailRembgModelOnly" if rembg_packages_ok else "settings.deps.detailRembgMissing"
    )

    return [
        {
            "id": "ffmpeg",
            "ok": ffmpeg_ok,
            "detail": ffmpeg if ffmpeg_ok else "settings.deps.detailFfprobeMissing" if ffmpeg else "settings.deps.detailFfmpegMissing",
            "usedBy": ["download", "tts", "video_sync", "video_to_gif", "gif_editor"],
            "required": True,
            "installable": not ffmpeg_ok,
            "sizeEstimate": "~35 MB" if not ffmpeg_ok else "",
        },
        {
            "id": "gifsicle",
            "ok": gifsicle is not None,
            "detail": gifsicle or "settings.deps.detailGifsicleMissing",
            "usedBy": ["video_to_gif", "gif_editor"],
            "required": False,
            "installable": gifsicle is None,
            "sizeEstimate": "~0.3 MB" if gifsicle is None else "",
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
            "detail": rembg_detail,
            "usedBy": ["rembg"],
            "required": False,
            "installable": not rembg_ok,
            "sizeEstimate": "" if rembg_ok else "~930 MB" if rembg_packages_ok else "~1.1 GB",
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
        *_whisper_dependencies(),
    ]

