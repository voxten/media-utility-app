"""Video → animated GIF / WebP / APNG with ffmpeg (two-pass palette for GIF), followed by
gifsicle optimization or fitting under a target size."""

from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image

from backend.core.ffmpeg import probe_media, run_ffmpeg
from backend.core.jobs import JobContext
from backend.services import gif_render
from backend.services.gif_render import OutputOptions

VIDEO_FORMATS = ("gif", "webp", "apng")
PREVIEW_SECONDS = 5.0
MAX_FPS = 50
MAX_SPEED = 4.0
MIN_SPEED = 0.25


def _clip(params: Dict[str, Any], duration: float) -> Dict[str, Any]:
    start = max(0.0, min(duration, float(params.get("start", 0.0))))
    end = float(params.get("end") or duration)
    end = max(start + 0.05, min(duration, end))
    speed = max(MIN_SPEED, min(MAX_SPEED, float(params.get("speed", 1.0))))
    return {
        "start": start,
        "end": end,
        "speed": speed,
        "fps": max(1, min(MAX_FPS, int(params.get("fps", 12)))),
        "width": max(0, int(params.get("width", 0))),
        "crop": params.get("crop") or None,
        "reverse": bool(params.get("reverse", False)),
    }


def _filter_graph(clip: Dict[str, Any], opts: OutputOptions) -> str:
    chain: List[str] = []
    crop = clip["crop"]
    if crop:
        chain.append(f"crop={int(crop['width'])}:{int(crop['height'])}:{int(crop['x'])}:{int(crop['y'])}")
    if clip["speed"] != 1.0:
        chain.append(f"setpts=PTS/{clip['speed']:.4f}")
    chain.append(f"fps={clip['fps']}")
    if clip["width"]:
        chain.append(f"scale={clip['width']}:-2:flags=lanczos")
    if clip["reverse"]:
        chain.append("reverse")

    if opts.format != "gif":
        return ",".join(chain)
    dither = "sierra2_4a" if opts.dither else "none"
    return (
        f"{','.join(chain)},split[a][b];"
        f"[a]palettegen=max_colors={opts.colors}:stats_mode=diff[p];"
        f"[b][p]paletteuse=dither={dither}:diff_mode=rectangle"
    )


def _encode(
    ctx: JobContext,
    path: str,
    clip: Dict[str, Any],
    opts: OutputOptions,
    out_path: Path,
    progress_span: float,
) -> None:
    out_duration = (clip["end"] - clip["start"]) / clip["speed"]
    args = [
        "-ss", f"{clip['start']:.3f}",
        "-t", f"{clip['end'] - clip['start']:.3f}",
        "-i", path,
        "-an",
        "-filter_complex" if opts.format == "gif" else "-vf", _filter_graph(clip, opts),
        *gif_render.ffmpeg_loop_args(opts.format, opts.plays),
    ]
    if opts.format == "webp":
        args.extend(["-c:v", "libwebp_anim", "-quality", str(opts.quality), "-lossless", "0", "-f", "webp"])
    elif opts.format == "apng":
        args.extend(["-c:v", "apng", "-f", "apng"])
    else:
        args.extend(["-f", "gif"])
    args.append(str(out_path))
    run_ffmpeg(ctx, args, out_duration, out_path=out_path, progress_span=progress_span,
               status_key="video_to_gif.status.encoding")


def _render(ctx: JobContext, path: str, clip: Dict[str, Any], opts: OutputOptions, out_path: Path) -> Optional[Dict[str, Any]]:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if opts.format != "gif" or not gif_render.gifsicle_available():
        _encode(ctx, path, clip, opts, out_path, 95)
        return _fit_by_reencoding(ctx, path, clip, opts, out_path) if opts.target_bytes else None

    raw = gif_render.temp_path(".gif")
    try:
        _encode(ctx, path, clip, opts, raw, 70)
        ctx.progress(75, "video_to_gif.status.optimizing")
        if opts.target_bytes:
            return gif_render.fit_gif(ctx, raw, out_path, opts)
        gif_render.optimize_gif(ctx, raw, out_path, opts)
        return None
    finally:
        raw.unlink(missing_ok=True)


def _fit_by_reencoding(
    ctx: JobContext,
    path: str,
    clip: Dict[str, Any],
    opts: OutputOptions,
    out_path: Path,
) -> Dict[str, Any]:
    """Without gifsicle (or for WebP/APNG) each step re-encodes: lower quality first, then width."""
    size = out_path.stat().st_size
    quality = opts.quality
    width = clip["width"] or _output_width(path, clip)
    for _ in range(gif_render.FIT_ATTEMPTS):
        if size <= opts.target_bytes:
            break
        ctx.check_cancelled()
        if opts.format == "webp" and quality > 40:
            quality = max(40, quality - 15)
        else:
            width = max(64, int(width * max(0.3, min(0.95, (opts.target_bytes / size) ** 0.5 * 0.95))) // 2 * 2)
        ctx.progress(95, "video_to_gif.status.fitting")
        _encode(ctx, path, {**clip, "width": width}, opts.replace(quality=quality), out_path, 0)
        size = out_path.stat().st_size
    return {"quality": quality, "width": width, "size": size, "reached": size <= opts.target_bytes}


def _output_width(path: str, clip: Dict[str, Any]) -> int:
    if clip["crop"]:
        return int(clip["crop"]["width"])
    return int(probe_media(path)["width"]) or 480


def preview(path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Renders up to PREVIEW_SECONDS of output with the real settings and extrapolates the full size."""
    duration = float(params.get("duration") or probe_media(path)["duration"])
    clip = _clip(params, duration)
    opts = OutputOptions.from_dict(params.get("output")).replace(target_bytes=0)
    if opts.format not in VIDEO_FORMATS:
        raise ValueError(f"Unsupported output format: {opts.format}")

    full_seconds = (clip["end"] - clip["start"]) / clip["speed"]
    shown_seconds = min(full_seconds, PREVIEW_SECONDS)
    sample = {**clip, "end": clip["start"] + shown_seconds * clip["speed"]}
    out = gif_render.temp_path(gif_render.EXTENSIONS[opts.format])
    try:
        _render(JobContext(), path, sample, opts, out)
        size = out.stat().st_size
        return {
            "dataUrl": gif_render.data_url(out, opts.format),
            "size": size,
            "previewSeconds": round(shown_seconds, 3),
            "estimatedSize": int(size * full_seconds / shown_seconds) if shown_seconds else size,
        }
    finally:
        out.unlink(missing_ok=True)


def render(ctx: JobContext, params: Dict[str, Any]) -> Dict[str, Any]:
    path = params["path"]
    if not Path(path).is_file():
        raise FileNotFoundError(f"File not found: {path}")
    out_path = Path(params["outPath"])
    opts = OutputOptions.from_dict(params.get("output"))
    if opts.format not in VIDEO_FORMATS:
        raise ValueError(f"Unsupported output format: {opts.format}")

    ctx.progress(0, "video_to_gif.status.encoding")
    ctx.log("video_to_gif.log.starting", file=Path(path).name, format=gif_render.DISPLAY_NAMES[opts.format])
    info = probe_media(path)
    clip = _clip(params, info["duration"])
    fit = _render(ctx, path, clip, opts, out_path)

    with Image.open(out_path) as img:
        width, height = img.size
        frame_count = getattr(img, "n_frames", 1)
    size = out_path.stat().st_size
    ctx.progress(100, "video_to_gif.status.done")
    ctx.log("video_to_gif.log.done", file=out_path.name, size=gif_render.human_size(size))
    if fit and not fit["reached"]:
        ctx.log("video_to_gif.log.targetMissed", level="warning", size=gif_render.human_size(size),
                target=gif_render.human_size(opts.target_bytes))
    return {
        "outPath": str(out_path),
        "size": size,
        "width": width,
        "height": height,
        "frames": frame_count,
        "duration": round((clip["end"] - clip["start"]) / clip["speed"], 3),
        "fit": fit,
    }
