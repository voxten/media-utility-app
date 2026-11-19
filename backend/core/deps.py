"""Health check of optional native/external dependencies shown on the Settings page."""

import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, NamedTuple, Optional

from backend.core import whisper_models
from backend.core.addons import is_damaged, module_available
from backend.core.paths import bin_dir, models_dir, project_root

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
    return module_available(name)


DAMAGED_DETAIL = "settings.deps.detailAddonDamaged"
# Download sizes shown before installing: the PyTorch CPU wheel and the weights each tool needs.
TORCH_SIZE_MB = 124.0
LAMA_SIZE_MB = 196.0
UPSCALE_SIZE_MB = {"general": 4.8, "anime": 17.9}


def _size_label(mb: float) -> str:
    return f"~{mb:.1f} MB" if mb < 20 else f"~{round(mb)} MB"


def ensure_app_paths(custom_ffmpeg: Optional[str] = None) -> None:
    """Ensure custom binaries and portable binaries in %APPDATA%\\MediaStudio\\bin are on PATH."""
    current_path = os.environ.get("PATH", "")
    paths_to_add: List[str] = []
    if custom_ffmpeg:
        cfp = Path(custom_ffmpeg)
        cdir = cfp if cfp.is_dir() else cfp.parent
        if cdir.is_dir():
            paths_to_add.append(str(cdir))
    binaries = bin_dir()
    if binaries.is_dir():
        paths_to_add.append(str(binaries))
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
    engine_damaged = any(is_damaged(name) for name in whisper_models.ENGINE_MODULES)
    items = []
    for model in whisper_models.MODELS.values():
        ok = engine_ok and whisper_models.is_model_downloaded(model.id)
        size = model.size + (0 if engine_ok else whisper_models.ENGINE_SIZE_MB * 1_000_000)
        if ok:
            detail = f"faster-whisper · {model.repo.split('/')[-1]}"
        elif engine_damaged:
            detail = DAMAGED_DETAIL
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
    # A package whose files went missing is offered for reinstall like a missing one, but says so.
    torch_damaged = is_damaged("torch")

    def torch_model_detail(ok: bool, name: str, has_model: bool, model_only_detail: str, full_detail: str) -> str:
        if ok:
            return name
        if torch_damaged:
            return DAMAGED_DETAIL
        if has_torch:
            return model_only_detail
        return "settings.deps.detailTorchOnly" if has_model else full_detail

    def torch_model_size(ok: bool, has_model: bool, model_mb: float) -> str:
        if ok:
            return ""
        return _size_label((0 if has_torch else TORCH_SIZE_MB) + (0 if has_model else model_mb))

    has_lama_model = lama_model_path() is not None
    lama_detail = torch_model_detail(
        lama_ok, "Model AI LaMa (big-lama.pt)", has_lama_model, "settings.deps.detailLamaModelOnly", "settings.deps.detailLamaFull"
    )
    lama_size = torch_model_size(lama_ok, has_lama_model, LAMA_SIZE_MB)

    upscale_gen_ok = is_upscale_ready("general")
    upscale_anime_ok = is_upscale_ready("anime")
    rembg_packages_ok = rembg_packages_ready()
    rembg_ok = rembg_packages_ok and rembg_model_path(DEFAULT_REMBG_MODEL) is not None
    if rembg_ok:
        rembg_detail = "BiRefNet (rembg + onnxruntime)"
    elif any(is_damaged(name) for name in ("rembg", "onnxruntime")):
        rembg_detail = DAMAGED_DETAIL
    elif rembg_packages_ok:
        rembg_detail = "settings.deps.detailRembgModelOnly"
    else:
        rembg_detail = "settings.deps.detailRembgMissing"

    def upscale_detail(ok: bool, model_id: str, name: str, model_only_detail: str) -> str:
        has_model = upscale_model_path(model_id) is not None
        return torch_model_detail(ok, name, has_model, model_only_detail, "settings.deps.detailUpscaleFull")

    def upscale_size(ok: bool, model_id: str) -> str:
        return torch_model_size(ok, upscale_model_path(model_id) is not None, UPSCALE_SIZE_MB[model_id])

    return [
        {
            "id": "ffmpeg",
            "ok": ffmpeg_ok,
            "detail": ffmpeg if ffmpeg_ok else "settings.deps.detailFfprobeMissing" if ffmpeg else "settings.deps.detailFfmpegMissing",
            "usedBy": ["media_convert", "download", "tts", "video_sync", "video_to_gif", "gif_editor", "transcribe"],
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
            "detail": upscale_detail(upscale_gen_ok, "general", "Real-ESRGAN General (realesr-general-x4v3)", "settings.deps.detailUpscaleGenMissing"),
            "usedBy": ["upscale"],
            "required": False,
            "installable": not upscale_gen_ok,
            "sizeEstimate": upscale_size(upscale_gen_ok, "general"),
        },
        {
            "id": "upscale_anime",
            "ok": upscale_anime_ok,
            "detail": upscale_detail(upscale_anime_ok, "anime", "Real-ESRGAN Anime (anime_6B)", "settings.deps.detailUpscaleAnimeMissing"),
            "usedBy": ["upscale"],
            "required": False,
            "installable": not upscale_anime_ok,
            "sizeEstimate": upscale_size(upscale_anime_ok, "anime"),
        },
        *_whisper_dependencies(),
    ]

