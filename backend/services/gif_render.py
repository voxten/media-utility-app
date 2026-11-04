"""Output side shared by the GIF tools: encoders for GIF, WebP, APNG and MP4, gifsicle
optimization and fitting a result under a target size."""

import base64
import math
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from PIL import Image

from backend.core.ffmpeg import has_binary, resolve_binary, run_ffmpeg, run_process
from backend.core.jobs import JobContext

FORMATS = ("gif", "webp", "apng", "mp4")
EXTENSIONS = {"gif": ".gif", "webp": ".webp", "apng": ".png", "mp4": ".mp4"}
MIME_TYPES = {"gif": "image/gif", "webp": "image/webp", "apng": "image/apng", "mp4": "video/mp4"}
DISPLAY_NAMES = {"gif": "GIF", "webp": "WebP", "apng": "APNG", "mp4": "MP4"}

MAX_LOSSY = 200
MIN_COLORS = 32
MIN_FRAME_MS = 20
FIT_ATTEMPTS = 6


@dataclass
class OutputOptions:
    format: str = "gif"
    lossy: int = 0
    colors: int = 256
    dither: bool = True
    plays: int = 0
    quality: int = 80
    target_bytes: int = 0

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> "OutputOptions":
        data = data or {}
        fmt = str(data.get("format", "gif")).lower()
        if fmt not in FORMATS:
            raise ValueError(f"Unsupported output format: {fmt}")
        return cls(
            format=fmt,
            lossy=max(0, min(MAX_LOSSY, int(data.get("lossy", 0)))),
            colors=max(2, min(256, int(data.get("colors", 256)))),
            dither=bool(data.get("dither", True)),
            plays=max(0, int(data.get("plays", 0))),
            quality=max(1, min(100, int(data.get("quality", 80)))),
            target_bytes=max(0, int(data.get("targetBytes", 0))),
        )

    def replace(self, **changes: Any) -> "OutputOptions":
        return OutputOptions(**{**self.__dict__, **changes})


def human_size(size: int) -> str:
    """Size for log messages, matching the UI's formatBytes."""
    value = float(size)
    for unit in ("B", "KB", "MB"):
        if value < 1024:
            return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} GB"


def gifsicle_available() -> bool:
    return has_binary("gifsicle")


def data_url(path: Path, fmt: str) -> str:
    return f"data:{MIME_TYPES[fmt]};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def temp_path(suffix: str) -> Path:
    handle = tempfile.NamedTemporaryFile(prefix="gif_", suffix=suffix, delete=False)
    handle.close()
    return Path(handle.name)


def ffmpeg_loop_args(fmt: str, plays: int) -> List[str]:
    """Muxer options for the number of plays (0 = forever) in ffmpeg's own conventions."""
    if fmt == "gif":
        return ["-loop", str(plays - 1 if plays > 0 else 0)]
    if fmt == "webp":
        return ["-loop", str(plays)]
    if fmt == "apng":
        return ["-plays", str(plays)]
    return []


def optimize_gif(ctx: JobContext, src: Path, dst: Path, opts: OutputOptions, scale: float = 1.0) -> None:
    """Rewrites ``src`` with gifsicle: frame optimization plus lossy, colour and scale reduction."""
    cmd = [resolve_binary("gifsicle"), "--no-warnings", "-O3"]
    if opts.lossy > 0:
        cmd.append(f"--lossy={opts.lossy}")
    if opts.colors < 256:
        cmd.append(f"--colors={opts.colors}")
        if opts.dither:
            cmd.append("--dither")
    if scale < 1.0:
        cmd.extend(["--scale", f"{scale:.4f}"])
    cmd.append("--loopcount=forever" if opts.plays == 0 else ("--no-loopcount" if opts.plays == 1 else f"--loopcount={opts.plays - 1}"))
    cmd.extend([str(src), "-o", str(dst)])
    run_process(ctx, cmd, out_path=dst)


def fit_gif(ctx: JobContext, src: Path, dst: Path, opts: OutputOptions) -> Dict[str, Any]:
    """Smallest loss that brings ``src`` under ``opts.target_bytes``.

    Bisects the lossy level first, then halves the palette, then scales the frames down in
    proportion to the remaining overshoot (file size follows the pixel count closely).
    """
    target = opts.target_bytes
    best: Dict[str, Any] = {}

    def attempt(candidate: OutputOptions, scale: float) -> int:
        trial = temp_path(".gif")
        try:
            optimize_gif(ctx, src, trial, candidate, scale)
            size = trial.stat().st_size
            if size <= target or not best or size < best["size"]:
                shutil.move(str(trial), dst)
                best.update(lossy=candidate.lossy, colors=candidate.colors, scale=round(scale, 3), size=size)
            return size
        finally:
            trial.unlink(missing_ok=True)

    if attempt(opts, 1.0) <= target:
        return {**best, "reached": True}

    low, high = opts.lossy, MAX_LOSSY
    if attempt(opts.replace(lossy=high), 1.0) <= target:
        while high - low > 10:
            ctx.check_cancelled()
            mid = (low + high) // 2
            if attempt(opts.replace(lossy=mid), 1.0) <= target:
                high = mid
            else:
                low = mid
        return {**best, "reached": True}

    candidate = opts.replace(lossy=MAX_LOSSY)
    while candidate.colors > MIN_COLORS:
        ctx.check_cancelled()
        candidate = candidate.replace(colors=max(MIN_COLORS, candidate.colors // 2))
        if attempt(candidate, 1.0) <= target:
            return {**best, "reached": True}

    scale = 1.0
    for _ in range(FIT_ATTEMPTS):
        ctx.check_cancelled()
        scale *= max(0.3, min(0.95, math.sqrt(target / best["size"]) * 0.95))
        if attempt(candidate, scale) <= target:
            return {**best, "reached": True}
    return {**best, "reached": False}


def _prepare_gif_frame(frame: Image.Image, opts: OutputOptions) -> Image.Image:
    if frame.mode == "RGBA" and frame.getextrema()[3][0] < 255:
        return frame
    dither = Image.Dither.FLOYDSTEINBERG if opts.dither else Image.Dither.NONE
    return frame.convert("RGB").quantize(opts.colors, method=Image.Quantize.MEDIANCUT, dither=dither)


def _flatten(frame: Image.Image) -> Image.Image:
    if frame.mode != "RGBA":
        return frame.convert("RGB")
    canvas = Image.new("RGB", frame.size, (255, 255, 255))
    canvas.paste(frame, mask=frame.getchannel("A"))
    return canvas


def save_frames(
    ctx: JobContext,
    frames: Sequence[Image.Image],
    durations: Sequence[int],
    dst: Path,
    opts: OutputOptions,
) -> Dict[str, Any]:
    """Encodes RGBA frames with per-frame durations (ms) into ``opts.format`` at ``dst``."""
    if not frames:
        raise ValueError("No frames to save")
    durations = [max(MIN_FRAME_MS, int(d)) for d in durations]
    dst.parent.mkdir(parents=True, exist_ok=True)
    fit: Optional[Dict[str, Any]] = None

    if opts.format == "gif":
        prepared = [_prepare_gif_frame(f, opts) for f in frames]
        extra = {"loop": opts.plays - 1 if opts.plays > 1 else 0} if opts.plays != 1 else {}
        if not gifsicle_available():
            prepared[0].save(dst, save_all=True, append_images=prepared[1:], duration=durations,
                             disposal=2, optimize=True, **extra)
        else:
            raw = temp_path(".gif")
            try:
                prepared[0].save(raw, save_all=True, append_images=prepared[1:], duration=durations,
                                 disposal=2, **extra)
                if opts.target_bytes:
                    fit = fit_gif(ctx, raw, dst, opts)
                else:
                    optimize_gif(ctx, raw, dst, opts)
            finally:
                raw.unlink(missing_ok=True)
    elif opts.format == "webp":
        fit = _save_webp(ctx, frames, durations, dst, opts)
    elif opts.format == "apng":
        frames[0].save(dst, format="PNG", save_all=True, append_images=list(frames[1:]),
                       duration=durations, loop=opts.plays, disposal=1)
    else:
        fit = _save_mp4(ctx, frames, durations, dst, opts)

    return {"size": dst.stat().st_size, "fit": fit}


def _save_webp(
    ctx: JobContext,
    frames: Sequence[Image.Image],
    durations: Sequence[int],
    dst: Path,
    opts: OutputOptions,
) -> Optional[Dict[str, Any]]:
    def encode(quality: int, scale: float) -> int:
        images = list(frames)
        if scale < 1.0:
            size = (max(1, round(images[0].width * scale)), max(1, round(images[0].height * scale)))
            images = [f.resize(size, Image.Resampling.LANCZOS) for f in images]
        images[0].save(dst, format="WEBP", save_all=True, append_images=images[1:], duration=list(durations),
                       loop=opts.plays, quality=quality, method=4)
        return dst.stat().st_size

    size = encode(opts.quality, 1.0)
    if not opts.target_bytes or size <= opts.target_bytes:
        return {"quality": opts.quality, "scale": 1.0, "size": size, "reached": True} if opts.target_bytes else None

    quality, scale = opts.quality, 1.0
    for _ in range(FIT_ATTEMPTS):
        ctx.check_cancelled()
        if quality > 40:
            quality = max(40, quality - 15)
        else:
            scale *= max(0.3, min(0.95, math.sqrt(opts.target_bytes / size) * 0.95))
        size = encode(quality, scale)
        if size <= opts.target_bytes:
            return {"quality": quality, "scale": round(scale, 3), "size": size, "reached": True}
    return {"quality": quality, "scale": round(scale, 3), "size": size, "reached": False}


def _save_mp4(
    ctx: JobContext,
    frames: Sequence[Image.Image],
    durations: Sequence[int],
    dst: Path,
    opts: OutputOptions,
) -> Optional[Dict[str, Any]]:
    total_s = sum(durations) / 1000
    source = temp_path(".png")
    try:
        flat = [_flatten(f) for f in frames]
        flat[0].save(source, format="PNG", save_all=True, append_images=flat[1:], duration=list(durations), loop=0)
        args = ["-f", "apng", "-i", str(source),
                "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p",
                "-c:v", "libx264", "-preset", "medium"]
        if opts.target_bytes:
            kbps = max(50, int(opts.target_bytes * 8 / 1000 / max(total_s, 0.1) * 0.95))
            args.extend(["-b:v", f"{kbps}k", "-maxrate", f"{kbps}k", "-bufsize", f"{kbps * 2}k"])
        else:
            args.extend(["-crf", str(round(51 - opts.quality * 0.33))])
        args.extend(["-movflags", "+faststart", "-an", "-f", "mp4", str(dst)])
        run_ffmpeg(ctx, args, total_s, out_path=dst)
    finally:
        source.unlink(missing_ok=True)
    if not opts.target_bytes:
        return None
    size = dst.stat().st_size
    return {"size": size, "reached": size <= opts.target_bytes}
