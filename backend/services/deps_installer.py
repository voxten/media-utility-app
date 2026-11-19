"""Downloads and installs optional dependencies from Settings: FFmpeg, AI models and their Python
packages, and newer download engines (yt-dlp, gallery-dl)."""

import hashlib
import importlib
import json
import logging
import shutil
import subprocess
import threading
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from backend.core.errors import AppError
from backend.core import engines, whisper_models
from backend.core.addons import (
    activate_addons,
    addons_dir,
    is_frozen,
    is_merge_pending,
    merge_staged,
    pip_install_command,
    staging_dir,
)
from backend.core.deps import (
    DEFAULT_REMBG_MODEL,
    LAMA_EXPECTED_SHA256,
    REMBG_MODELS,
    REMBG_RELEASE_URL,
    _has_module,
    ensure_app_paths,
    is_lama_ready,
    lama_model_path,
    rembg_model_path,
    rembg_packages_ready,
)
from backend.core.jobs import JobCancelled, JobContext
from backend.core.paths import app_data_dir, cache_dir, models_dir
from backend.core.paths import bin_dir as paths_bin_dir

logger = logging.getLogger(__name__)

LAMA_MODEL_URL = "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt"
# Pinned releases: a fixed URL is what lets the download be checked against a fixed SHA-256.
# Add-ons are pinned like faster-whisper, so a new release cannot break an install that worked.
TORCH_PACKAGES = ["torch==2.15.0"]
REMBG_PACKAGES = ["rembg[cpu]==2.0.87", "onnxruntime==1.31.1", "pymatting==1.1.16"]
FFMPEG_WINDOWS_URL = "https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip"
FFMPEG_WINDOWS_SHA256 = "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba"
GIFSICLE_WINDOWS_URL = "https://eternallybored.org/misc/gifsicle/releases/gifsicle-1.97-win64.zip"
GIFSICLE_WINDOWS_SHA256 = "bb3ad4e1521a3953152f406eaafabda153fb5986938405860a7e7f12a3d13227"


def _download_file_with_progress(
    ctx: JobContext,
    url: str,
    target_path: Path,
    *,
    expected_sha256: str,
    status_key: str = "deps.status.downloading",
    progress_start: float = 0.0,
    progress_span: float = 100.0,
) -> Path:
    """Streams a file download reporting progress to JobContext.

    The file only reaches ``target_path`` when its SHA-256 matches, so a tampered or truncated
    download is never left where the app would load or run it.
    """
    if not expected_sha256:
        raise ValueError(f"No SHA-256 known for {url}")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target_path.with_suffix(f"{target_path.suffix}.tmp")

    req = urllib.request.Request(url, headers={"User-Agent": "MediaStudio"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp, open(tmp_path, "wb") as f:
            total_str = resp.headers.get("Content-Length")
            total = int(total_str) if total_str and total_str.isdigit() else 0
            downloaded = 0
            hasher = hashlib.sha256()
            chunk_size = 256 * 1024

            while True:
                ctx.check_cancelled()
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                hasher.update(chunk)

                if total > 0:
                    pct = downloaded * 100.0 / total
                    ctx_pct = progress_start + (pct / 100.0) * progress_span
                    ctx.progress(
                        ctx_pct,
                        status_key,
                        {"percent": round(pct), "downloaded": downloaded, "total": total},
                    )

        actual = hasher.hexdigest()
        if actual != expected_sha256.lower():
            logger.error("SHA-256 mismatch for %s: got %s, expected %s", target_path.name, actual, expected_sha256)
            raise AppError("errors.downloadCorrupted", file=target_path.name)

        tmp_path.replace(target_path)
        return target_path
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise


CANCEL_POLL_S = 0.2


def _pip(ctx: JobContext, cmd: Sequence[str]) -> None:
    """Runs pip; Cancel stops it at once, also while it downloads without printing anything."""
    proc = subprocess.Popen(
        list(cmd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )

    def stop_on_cancel() -> None:
        while proc.poll() is None:
            if ctx.cancelled:
                proc.kill()
                return
            time.sleep(CANCEL_POLL_S)

    threading.Thread(target=stop_on_cancel, daemon=True).start()
    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            stripped = line.strip()
            if stripped:
                ctx.log("deps.log.pipOutput", line=stripped)
        proc.wait()
    finally:
        if proc.poll() is None:
            proc.kill()
    ctx.check_cancelled()
    if proc.returncode != 0:
        raise AppError("errors.installFailed", code=proc.returncode)


def _run_pip(ctx: JobContext, packages: Sequence[str], target: Optional[Path] = None, no_deps: bool = False) -> None:
    """Installs Python packages where this app can import them, streaming pip's output to the job log.

    The packaged app installs add-ons into a staging folder and moves them into place only when pip
    succeeds, so a cancelled or failed install never leaves a half-copied PyTorch that looks installed.
    A move that fails half-way keeps the staging folder, and the next start finishes it.
    """
    staged = None
    if target is None and is_frozen():
        staged = target = staging_dir()
        shutil.rmtree(staged, ignore_errors=True)
    try:
        _pip(ctx, pip_install_command(packages, target=target, no_deps=no_deps))
        if staged is not None:
            try:
                merge_staged(staged, addons_dir())
            except OSError as exc:
                logger.exception("Moving the add-on into place failed")
                raise AppError("errors.addonMoveInterrupted") from exc
    finally:
        if staged is not None and not is_merge_pending(staged):
            shutil.rmtree(staged, ignore_errors=True)

    # New packages must be importable in this process without restarting the app.
    activate_addons()
    importlib.invalidate_caches()


def _install_torch(ctx: JobContext) -> None:
    ctx.progress(5, "deps.status.installingTorch")
    ctx.log("deps.log.installingTorch")
    _run_pip(ctx, TORCH_PACKAGES)
    ctx.progress(40, "deps.status.torchInstalled")
    ctx.log("deps.log.torchInstalled")


def install_lama(ctx: JobContext) -> Dict[str, Any]:
    """Downloads weights and/or installs PyTorch needed for LaMa inpainting."""
    if is_lama_ready():
        ctx.progress(100, "deps.status.done")
        return {"id": "lama", "ok": True}

    has_torch = _has_module("torch")
    if not has_torch:
        _install_torch(ctx)

    model_dest = models_dir() / "big-lama.pt"
    if not model_dest.is_file() or model_dest.stat().st_size < 100_000_000:
        ctx.progress(40 if not has_torch else 5, "deps.status.downloadingModel", {"percent": 0})
        ctx.log("deps.log.downloadingModel", model=model_dest.name)
        _download_file_with_progress(
            ctx,
            url=LAMA_MODEL_URL,
            target_path=model_dest,
            expected_sha256=LAMA_EXPECTED_SHA256,
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
        raise AppError("errors.addonBroken") from exc

    ctx.progress(100, "deps.status.done")
    ctx.log("deps.log.done")
    return {"id": "lama", "ok": True}


def _install_portable_zip(
    ctx: JobContext,
    dep_id: str,
    url: str,
    sha256: str,
    executables: Sequence[str],
    status_key: str,
    log_key: str,
    done_log_key: str,
    extract_keys: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    """Download a pinned Windows zip and copy ``executables`` from it into %APPDATA%/MediaStudio/bin.

    Skipped when every executable is already on PATH or in the bin folder. ``extract_keys``
    (status, log) show an extracting step at 80 %; without it the download takes the whole bar.
    """
    bin_dir = paths_bin_dir()
    bin_dir.mkdir(parents=True, exist_ok=True)
    if all(shutil.which(Path(exe).stem) or (bin_dir / exe).is_file() for exe in executables):
        ensure_app_paths()
        ctx.progress(100, "deps.status.done")
        return {"id": dep_id, "ok": True}

    zip_path = cache_dir() / f"{dep_id}.zip"
    ctx.progress(5, status_key, {"percent": 0})
    ctx.log(log_key)

    _download_file_with_progress(
        ctx,
        url=url,
        target_path=zip_path,
        expected_sha256=sha256,
        status_key=status_key,
        progress_start=5,
        progress_span=75 if extract_keys else 85,
    )

    if extract_keys:
        ctx.progress(80, extract_keys[0])
        ctx.log(extract_keys[1])

    wanted = {name.lower() for name in executables}
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.namelist():
                base_name = Path(member).name.lower()
                if base_name in wanted:
                    wanted.discard(base_name)
                    with zf.open(member) as source, (bin_dir / base_name).open("wb") as out:
                        shutil.copyfileobj(source, out)
    finally:
        zip_path.unlink(missing_ok=True)

    ensure_app_paths()
    if wanted:
        raise AppError("errors.archiveIncomplete", files=", ".join(sorted(wanted)))

    ctx.progress(100, "deps.status.done")
    ctx.log(done_log_key)
    return {"id": dep_id, "ok": True}


def install_ffmpeg(ctx: JobContext) -> Dict[str, Any]:
    """Downloads portable FFmpeg build on Windows and places it into %APPDATA%/MediaStudio/bin."""
    return _install_portable_zip(
        ctx,
        "ffmpeg",
        FFMPEG_WINDOWS_URL,
        FFMPEG_WINDOWS_SHA256,
        ("ffmpeg.exe", "ffprobe.exe"),
        "deps.status.downloadingFfmpeg",
        "deps.log.downloadingFfmpeg",
        "deps.log.ffmpegInstalled",
        ("deps.status.extractingFfmpeg", "deps.log.extractingFfmpeg"),
    )


UPSCALE_MODELS = {
    "upscale_general": {
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth",
        "filename": "realesr-general-x4v3.pth",
        "sha256": "8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292",
        "min_size": 4_000_000,
        "arch": "general",
    },
    "upscale_anime": {
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth",
        "filename": "RealESRGAN_x4plus_anime_6B.pth",
        "sha256": "f872d837d3c90ed2e05227bed711af5671a6fd1c9f7d7e91c911a61f155e99da",
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
        _install_torch(ctx)

    dest = models_dir() / cfg["filename"]
    if not dest.is_file() or dest.stat().st_size < cfg["min_size"]:
        start_pct = 40 if not has_torch else 5
        span_pct = 50 if not has_torch else 85
        ctx.progress(start_pct, "deps.status.downloadingModel", {"percent": 0})
        ctx.log("deps.log.downloadingModel", model=dest.name)
        _download_file_with_progress(
            ctx,
            url=cfg["url"],
            target_path=dest,
            expected_sha256=cfg["sha256"],
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


def download_rembg_model(
    ctx: JobContext, name: str, progress_start: float = 0.0, progress_span: float = 100.0
) -> Path:
    """The background removal model ``name``, downloaded with progress and checked first if missing."""
    existing = rembg_model_path(name)
    if existing is not None:
        return existing
    model = REMBG_MODELS[name]
    ctx.progress(progress_start, "deps.status.downloadingModel", {"percent": 0})
    ctx.log("deps.log.downloadingModel", model=model.file)
    path = _download_file_with_progress(
        ctx,
        url=REMBG_RELEASE_URL + model.file,
        target_path=models_dir() / f"{name}.onnx",
        expected_sha256=model.sha256,
        status_key="deps.status.downloadingModel",
        progress_start=progress_start,
        progress_span=progress_span,
    )
    ctx.log("deps.log.modelDownloaded")
    return path


def install_rembg(ctx: JobContext) -> Dict[str, Any]:
    """Installs rembg, onnxruntime and pymatting, then downloads the default BiRefNet model."""
    model_start = 0.0
    if not rembg_packages_ready():
        ctx.progress(5, "deps.status.installingRembg")
        ctx.log("deps.log.installingRembg")
        _run_pip(ctx, REMBG_PACKAGES)

        ctx.progress(20, "deps.status.verifying")
        ctx.log("deps.log.verifying")
        try:
            import onnxruntime  # noqa: F401
            import rembg  # noqa: F401
        except Exception as exc:
            raise AppError("errors.addonBroken") from exc
        model_start = 20.0

    download_rembg_model(ctx, DEFAULT_REMBG_MODEL, model_start, 100 - model_start)

    ctx.progress(100, "deps.status.done")
    ctx.log("deps.log.done")
    return {"id": "rembg", "ok": True}


def install_whisper(ctx: JobContext, model: whisper_models.WhisperModel) -> Dict[str, Any]:
    """Installs faster-whisper (once) and downloads one Whisper model."""
    dep_id = f"{whisper_models.DEP_PREFIX}{model.id}"
    if whisper_models.is_ready(model.id):
        ctx.progress(100, "deps.status.done")
        return {"id": dep_id, "ok": True}

    start = 5.0
    if not whisper_models.is_engine_installed():
        ctx.progress(start, "deps.status.installingWhisper")
        ctx.log("deps.log.installingWhisper")
        _run_pip(ctx, whisper_models.ENGINE_PACKAGES)
        start = 30.0

    folder = whisper_models.model_dir(model.id)
    span = 90.0 - start
    done_bytes = 0
    ctx.log("deps.log.downloadingWhisper", model=model.id)
    for name, size in model.files.items():
        target = folder / name
        if not target.is_file() or target.stat().st_size != size:
            _download_file_with_progress(
                ctx,
                url=whisper_models.file_url(model, name),
                target_path=target,
                expected_sha256=model.sha256.get(name, ""),
                status_key="deps.status.downloadingWhisper",
                progress_start=start + span * done_bytes / model.size,
                progress_span=span * size / model.size,
            )
            if target.stat().st_size != size:
                target.unlink(missing_ok=True)
                raise RuntimeError(f"{name}: unexpected size")
        done_bytes += size

    ctx.progress(95, "deps.status.verifying")
    ctx.log("deps.log.verifyingWhisper")
    try:
        from backend.services import transcribe

        transcribe.verify_model(model.id)
    except Exception as exc:
        raise AppError("errors.addonBroken") from exc

    ctx.progress(100, "deps.status.done")
    ctx.log("deps.log.done")
    return {"id": dep_id, "ok": True}


def install_gifsicle(ctx: JobContext) -> Dict[str, Any]:
    """Downloads the portable gifsicle build on Windows and places it into %APPDATA%/MediaStudio/bin."""
    return _install_portable_zip(
        ctx,
        "gifsicle",
        GIFSICLE_WINDOWS_URL,
        GIFSICLE_WINDOWS_SHA256,
        ("gifsicle.exe",),
        "deps.status.downloadingGifsicle",
        "deps.log.downloadingGifsicle",
        "deps.log.gifsicleInstalled",
    )


def _verify_engine(engine_id: str, folder: Path) -> None:
    """Imports the new copy in a separate process, so a broken release never reaches this one."""
    report = cache_dir() / f"engine-check-{engine_id}.json"
    report.unlink(missing_ok=True)
    try:
        proc = subprocess.run(
            engines.check_command(engine_id, folder, report),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        try:
            result = json.loads(report.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            result = {"ok": False, "error": (proc.stderr or proc.stdout or "").strip()}
    finally:
        report.unlink(missing_ok=True)
    if proc.returncode != 0 or not result.get("ok"):
        error = str(result.get("error") or f"exit code {proc.returncode}").strip()
        logger.warning("New %s failed verification: %s", engine_id, error)
        raise RuntimeError(f"{engine_id}: {error.splitlines()[-1] if error else 'verification failed'}")


def update_engines(ctx: JobContext, settings: Any) -> Dict[str, Any]:
    """Installs newer yt-dlp / gallery-dl next to the bundled ones; they take effect after a restart."""
    def pending_engines() -> List[engines.Engine]:
        return [engines.get_engine(item["id"]) for item in engines.status(settings) if item["updateAvailable"]]

    latest: Dict[str, Any] = settings.get("engineLatest") or {}
    pending = pending_engines()
    if any(not engines.has_install_specs(engine, latest.get(engine.id) or {}) for engine in pending):
        engines.check_updates(settings)
        latest = settings.get("engineLatest") or {}
        pending = pending_engines()
    updated: List[str] = []
    for index, engine in enumerate(pending):
        share = 100.0 / len(pending)
        base = index * share
        version = latest[engine.id]["version"]
        staged = engines.staging_dir(engine.id)
        shutil.rmtree(staged, ignore_errors=True)
        requirements = engines.engines_dir() / f"{engine.id}-requirements.txt"
        requirements.parent.mkdir(parents=True, exist_ok=True)
        try:
            ctx.progress(base + share * 0.1, "engines.status.installing", {"name": engine.id, "version": version})
            ctx.log("engines.log.installing", name=engine.id, version=version)
            requirements.write_text("\n".join(engines.install_specs(engine, latest[engine.id])) + "\n", encoding="utf-8")
            _run_pip(ctx, ["--require-hashes", "-r", str(requirements)], target=staged, no_deps=True)
            ctx.check_cancelled()
            ctx.progress(base + share * 0.7, "engines.status.verifying", {"name": engine.id})
            ctx.log("engines.log.verifying", name=engine.id)
            _verify_engine(engine.id, staged)
            engines.replace_with_staged(engine.id)
        finally:
            shutil.rmtree(staged, ignore_errors=True)
            requirements.unlink(missing_ok=True)
        updated.append(engine.id)
        ctx.log("engines.log.installed", name=engine.id, version=version)
    ctx.progress(100, "engines.status.done")
    return {"updated": updated, "engines": engines.status(settings)}


def install_dependency(ctx: JobContext, dep_id: str) -> Dict[str, Any]:
    """Entry point for installing a background dependency."""
    if dep_id == "lama":
        return install_lama(ctx)
    if dep_id == "ffmpeg":
        return install_ffmpeg(ctx)
    if dep_id == "gifsicle":
        return install_gifsicle(ctx)
    if dep_id == "rembg":
        return install_rembg(ctx)
    if dep_id in UPSCALE_MODELS:
        return install_upscale(ctx, dep_id)
    whisper_model = whisper_models.model_for_dep(dep_id)
    if whisper_model is not None:
        return install_whisper(ctx, whisper_model)
    raise ValueError(f"Unknown or unsupported dependency: {dep_id}")
