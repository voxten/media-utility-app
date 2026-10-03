"""Service for downloading and installing external dependencies (LaMa AI model, FFmpeg)."""

import hashlib
import logging
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Dict

from backend.core.deps import (
    LAMA_EXPECTED_MD5,
    _has_module,
    ensure_app_paths,
    is_lama_ready,
    is_rembg_ready,
    lama_model_path,
)
from backend.core.jobs import JobCancelled, JobContext
from backend.core.paths import app_data_dir, cache_dir

logger = logging.getLogger(__name__)

LAMA_MODEL_URL = "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt"
FFMPEG_WINDOWS_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"


def _download_file_with_progress(
    ctx: JobContext,
    url: str,
    target_path: Path,
    expected_md5: str = "",
    status_key: str = "deps.status.downloading",
    progress_start: float = 0.0,
    progress_span: float = 100.0,
) -> Path:
    """Streams a file download reporting progress to JobContext and verifying MD5."""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target_path.with_suffix(f"{target_path.suffix}.tmp")

    req = urllib.request.Request(url, headers={"User-Agent": "MediaStudio"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp, open(tmp_path, "wb") as f:
            total_str = resp.headers.get("Content-Length")
            total = int(total_str) if total_str and total_str.isdigit() else 0
            downloaded = 0
            hasher = hashlib.md5()
            chunk_size = 256 * 1024

            while True:
                ctx.check_cancelled()
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if expected_md5:
                    hasher.update(chunk)

                if total > 0:
                    pct = downloaded * 100.0 / total
                    ctx_pct = progress_start + (pct / 100.0) * progress_span
                    ctx.progress(
                        ctx_pct,
                        status_key,
                        {"percent": round(pct), "downloaded": downloaded, "total": total},
                    )

        if expected_md5:
            actual_md5 = hasher.hexdigest()
            if actual_md5.lower() != expected_md5.lower():
                tmp_path.unlink(missing_ok=True)
                raise ValueError(f"MD5 checksum mismatch (got {actual_md5}, expected {expected_md5})")

        tmp_path.replace(target_path)
        return target_path
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise


def _install_torch_pip(ctx: JobContext) -> None:
    """Installs PyTorch into the current Python environment using pip."""
    ctx.progress(5, "deps.status.installingTorch")
    ctx.log("deps.log.installingTorch")

    cmd = [sys.executable, "-m", "pip", "install", "torch", "--no-warn-script-location"]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    try:
        while True:
            if ctx.cancelled:
                proc.terminate()
                raise JobCancelled()
            line = proc.stdout.readline() if proc.stdout else ""
            if not line and proc.poll() is not None:
                break
            if line:
                stripped = line.strip()
                if stripped:
                    ctx.log("deps.log.pipOutput", line=stripped)
    finally:
        if proc.poll() is None:
            proc.kill()

    if proc.returncode != 0:
        raise RuntimeError(f"Pip install failed with return code {proc.returncode}")

    ctx.progress(40, "deps.status.torchInstalled")
    ctx.log("deps.log.torchInstalled")


def install_lama(ctx: JobContext) -> Dict[str, Any]:
    """Downloads weights and/or installs PyTorch needed for LaMa inpainting."""
    if is_lama_ready():
        ctx.progress(100, "deps.status.done")
        return {"id": "lama", "ok": True}

    has_torch = _has_module("torch")
    if not has_torch:
        _install_torch_pip(ctx)

    model_dest = app_data_dir() / "models" / "big-lama.pt"
    if not model_dest.is_file() or model_dest.stat().st_size < 100_000_000:
        ctx.progress(40 if not has_torch else 5, "deps.status.downloadingModel", {"percent": 0})
        ctx.log("deps.log.downloadingModel")
        _download_file_with_progress(
            ctx,
            url=LAMA_MODEL_URL,
            target_path=model_dest,
            expected_md5=LAMA_EXPECTED_MD5,
            status_key="deps.status.downloadingModel",
            progress_start=40 if not has_torch else 5,
            progress_span=50 if not has_torch else 85,
        )
        ctx.log("deps.log.modelDownloaded")

    # Verify model loading
    ctx.progress(95, "deps.status.verifying")
    ctx.log("deps.log.verifying")
    try:
        import torch

        model = torch.jit.load(str(model_dest), map_location="cpu")
        model.eval()
    except Exception as exc:
        raise RuntimeError(f"Could not load LaMa model: {exc}") from exc

    ctx.progress(100, "deps.status.done")
    ctx.log("deps.log.done")
    return {"id": "lama", "ok": True}


def install_ffmpeg(ctx: JobContext) -> Dict[str, Any]:
    """Downloads portable FFmpeg build on Windows and places it into %APPDATA%/MediaStudio/bin."""
    bin_dir = app_data_dir() / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    target_ffmpeg = bin_dir / "ffmpeg.exe"

    if shutil.which("ffmpeg") or target_ffmpeg.is_file():
        ensure_app_paths()
        ctx.progress(100, "deps.status.done")
        return {"id": "ffmpeg", "ok": True}

    zip_path = cache_dir() / "ffmpeg.zip"
    ctx.progress(5, "deps.status.downloadingFfmpeg", {"percent": 0})
    ctx.log("deps.log.downloadingFfmpeg")

    _download_file_with_progress(
        ctx,
        url=FFMPEG_WINDOWS_URL,
        target_path=zip_path,
        status_key="deps.status.downloadingFfmpeg",
        progress_start=5,
        progress_span=75,
    )

    ctx.progress(80, "deps.status.extractingFfmpeg")
    ctx.log("deps.log.extractingFfmpeg")

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.namelist():
                base_name = Path(member).name.lower()
                if base_name in ("ffmpeg.exe", "ffprobe.exe"):
                    source = zf.open(member)
                    target = bin_dir / base_name
                    with target.open("wb") as out:
                        shutil.copyfileobj(source, out)
    finally:
        zip_path.unlink(missing_ok=True)

    ensure_app_paths()
    if not target_ffmpeg.is_file():
        raise RuntimeError("ffmpeg.exe was not found inside the downloaded archive")

    ctx.progress(100, "deps.status.done")
    ctx.log("deps.log.ffmpegInstalled")
    return {"id": "ffmpeg", "ok": True}


UPSCALE_MODELS = {
    "upscale_general": {
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth",
        "filename": "realesr-general-x4v3.pth",
        "min_size": 4_000_000,
        "arch": "general",
    },
    "upscale_anime": {
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth",
        "filename": "RealESRGAN_x4plus_anime_6B.pth",
        "min_size": 16_000_000,
        "arch": "anime",
    },
}


def install_upscale(ctx: JobContext, dep_id: str) -> Dict[str, Any]:
    """Downloads weights for Real-ESRGAN upscale models."""
    cfg = UPSCALE_MODELS.get(dep_id)
    if not cfg:
        raise ValueError(f"Unknown upscale model dependency: {dep_id}")

    has_torch = _has_module("torch")
    if not has_torch:
        _install_torch_pip(ctx)

    dest = app_data_dir() / "models" / cfg["filename"]
    if not dest.is_file() or dest.stat().st_size < cfg["min_size"]:
        start_pct = 40 if not has_torch else 5
        span_pct = 50 if not has_torch else 85
        ctx.progress(start_pct, "deps.status.downloadingModel", {"percent": 0})
        ctx.log("deps.log.downloadingModel")
        _download_file_with_progress(
            ctx,
            url=cfg["url"],
            target_path=dest,
            status_key="deps.status.downloadingModel",
            progress_start=start_pct,
            progress_span=span_pct,
        )
        ctx.log("deps.log.modelDownloaded")

    ctx.progress(95, "deps.status.verifying")
    ctx.log("deps.log.verifying")
    from backend.services.ai_models import load_upscale_model

    load_upscale_model(cfg["arch"], str(dest))

    ctx.progress(100, "deps.status.done")
    ctx.log("deps.log.done")
    return {"id": dep_id, "ok": True}


def install_rembg(ctx: JobContext) -> Dict[str, Any]:
    """Installs rembg, onnxruntime, and pymatting for AI background removal."""
    if is_rembg_ready():
        ctx.progress(100, "deps.status.done")
        return {"id": "rembg", "ok": True}

    ctx.progress(5, "deps.status.installingRembg")
    ctx.log("deps.log.installingRembg")

    cmd = [sys.executable, "-m", "pip", "install", "rembg[cpu]", "onnxruntime", "pymatting", "--no-warn-script-location"]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    try:
        while True:
            if ctx.cancelled:
                proc.terminate()
                raise JobCancelled()
            line = proc.stdout.readline() if proc.stdout else ""
            if not line and proc.poll() is not None:
                break
            if line:
                stripped = line.strip()
                if stripped:
                    ctx.log("deps.log.pipOutput", line=stripped)
    finally:
        if proc.poll() is None:
            proc.kill()

    if proc.returncode != 0:
        raise RuntimeError(f"Pip install failed with return code {proc.returncode}")

    ctx.progress(90, "deps.status.verifying")
    ctx.log("deps.log.verifying")

    try:
        import onnxruntime  # noqa: F401
        import rembg  # noqa: F401
    except Exception as exc:
        raise RuntimeError(f"Could not verify rembg/onnxruntime installation: {exc}") from exc

    ctx.progress(100, "deps.status.done")
    ctx.log("deps.log.done")
    return {"id": "rembg", "ok": True}


def install_dependency(ctx: JobContext, dep_id: str) -> Dict[str, Any]:
    """Entry point for installing a background dependency."""
    if dep_id == "lama":
        return install_lama(ctx)
    if dep_id == "ffmpeg":
        return install_ffmpeg(ctx)
    if dep_id == "rembg":
        return install_rembg(ctx)
    if dep_id in UPSCALE_MODELS:
        return install_upscale(ctx, dep_id)
    raise ValueError(f"Unknown or unsupported dependency: {dep_id}")
