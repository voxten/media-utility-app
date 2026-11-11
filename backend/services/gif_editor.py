"""GIF Editor: decodes an animated GIF / WebP / APNG into full RGBA frames, applies frame-range,
geometry, speed and order operations and saves through gif_render."""

import bisect
from pathlib import Path
from typing import Any, Dict, List, Tuple

from PIL import Image, ImageSequence

from backend.core import thumbs
from backend.core.jobs import JobContext
from backend.core.paths import unique_path
from backend.services import gif_render
from backend.services.gif_render import OutputOptions
from backend.services.image_editor import apply_operations

SUPPORTED_EXTENSIONS = {".gif", ".webp", ".png", ".apng"}
DEFAULT_FRAME_MS = 100
MAX_INLINE_BYTES = 40 * 1024 * 1024
PREVIEW_MAX_SIDE = 480

Frames = Tuple[List[Image.Image], List[int]]


def _decode(path: str) -> Frames:
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    frames: List[Image.Image] = []
    durations: List[int] = []
    with Image.open(p) as img:
        for frame in ImageSequence.Iterator(img):
            frames.append(frame.convert("RGBA"))
            durations.append(int(frame.info.get("duration") or DEFAULT_FRAME_MS))
    return frames, durations


def _starts(durations: List[int]) -> List[float]:
    starts, t = [], 0.0
    for d in durations:
        starts.append(t)
        t += d / 1000
    return starts


def load(path: str) -> Dict[str, Any]:
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    with Image.open(p) as img:
        width, height = img.size
        frame_count = getattr(img, "n_frames", 1)
        durations = []
        for frame in ImageSequence.Iterator(img):
            durations.append(int(frame.info.get("duration") or DEFAULT_FRAME_MS))
        loop = img.info.get("loop")
        fmt = "apng" if img.format == "PNG" else (img.format or p.suffix.lstrip(".")).lower()
    size = p.stat().st_size
    mime_fmt = fmt if fmt in gif_render.MIME_TYPES else "gif"
    return {
        "path": str(p),
        "fileName": p.name,
        "size": size,
        "width": width,
        "height": height,
        "frames": frame_count,
        "duration": round(sum(durations) / 1000, 3),
        "plays": _plays(fmt, loop),
        "format": fmt,
        "dataUrl": gif_render.data_url(p, mime_fmt) if size <= MAX_INLINE_BYTES else "",
    }


def _plays(fmt: str, loop: Any) -> int:
    """Number of plays (0 = forever); a GIF's Netscape loop counts repeats after the first play."""
    if loop is None:
        return 1
    if int(loop) == 0:
        return 0
    return int(loop) + 1 if fmt == "gif" else int(loop)


def frames(path: str, start_sec: float, duration: float, count: int, height: int = 96) -> Dict[str, Any]:
    """Frames nearest to evenly spaced times over the window, for the trim timeline."""
    images, durations = _decode(path)
    starts = _starts(durations)
    count = max(1, min(int(count), 200))
    step = max(0.0, float(duration)) / count
    result = []
    for i in range(count):
        t = round(max(0.0, start_sec + (i + 0.5) * step), 3)
        index = max(0, bisect.bisect_right(starts, t) - 1)
        thumb = images[index].copy()
        thumb.thumbnail((height * 8, height), Image.Resampling.LANCZOS)
        result.append({"time": t, "dataUrl": thumbs.to_data_url(thumb, max_size=None, fmt="JPEG", quality=75)})
    return {"frames": result}


def apply(images: List[Image.Image], durations: List[int], ops: Dict[str, Any]) -> Frames:
    """Frame range → crop / rotate / flip / resize on every frame → speed → order."""
    trim = ops.get("trim")
    if trim:
        starts = _starts(durations)
        start, end = float(trim.get("start", 0.0)), float(trim.get("end", starts[-1] + durations[-1] / 1000))
        keep = [i for i, t in enumerate(starts) if start - 1e-6 <= t < end] or [max(0, bisect.bisect_right(starts, start) - 1)]
        images = [images[i] for i in keep]
        durations = [durations[i] for i in keep]

    geometry = {k: ops[k] for k in ("crop", "rotate", "flip_h", "flip_v", "resize") if ops.get(k)}
    if geometry:
        images = [apply_operations(img, geometry) for img in images]

    speed = float(ops.get("speed", 1.0))
    if speed > 0 and speed != 1.0:
        durations = [max(gif_render.MIN_FRAME_MS, round(d / speed)) for d in durations]

    if ops.get("reverse"):
        images, durations = images[::-1], durations[::-1]
    if ops.get("boomerang") and len(images) > 2:
        images = images + images[-2:0:-1]
        durations = durations + durations[-2:0:-1]
    return images, durations


def _result_info(path: Path, images: List[Image.Image], durations: List[int]) -> Dict[str, Any]:
    return {
        "width": images[0].width,
        "height": images[0].height,
        "frames": len(images),
        "duration": round(sum(durations) / 1000, 3),
        "size": path.stat().st_size,
    }


def preview(path: str, ops: Dict[str, Any], output: Dict[str, Any]) -> Dict[str, Any]:
    """The edited animation at most PREVIEW_MAX_SIDE wide, with the size of the full-resolution result."""
    opts = OutputOptions.from_dict(output)
    images, durations = apply(*_decode(path), ops)
    full = gif_render.temp_path(gif_render.EXTENSIONS[opts.format])
    shown = full
    try:
        fit = gif_render.save_frames(JobContext(), images, durations, full, opts)["fit"]
        info = _result_info(full, images, durations)
        if opts.format == "mp4" or max(images[0].size) > PREVIEW_MAX_SIDE:
            shown = gif_render.temp_path(gif_render.EXTENSIONS["webp"])
            small = [img.copy() for img in images]
            for img in small:
                img.thumbnail((PREVIEW_MAX_SIDE, PREVIEW_MAX_SIDE), Image.Resampling.LANCZOS)
            gif_render.save_frames(JobContext(), small, durations, shown, OutputOptions(format="webp", quality=85))
            preview_fmt = "webp"
        else:
            preview_fmt = opts.format
        return {**info, "fit": fit, "dataUrl": gif_render.data_url(shown, preview_fmt)}
    finally:
        full.unlink(missing_ok=True)
        if shown != full:
            shown.unlink(missing_ok=True)


def _render_one(ctx: JobContext, src: str, out_path: Path, ops: Dict[str, Any], opts: OutputOptions) -> Dict[str, Any]:
    images, durations = apply(*_decode(src), ops)
    ctx.check_cancelled()
    fit = gif_render.save_frames(ctx, images, durations, out_path, opts)["fit"]
    in_bytes = Path(src).stat().st_size
    info = _result_info(out_path, images, durations)
    return {
        **info,
        "file": src,
        "dest": str(out_path),
        "originalSize": in_bytes,
        "savedPercent": round((1 - info["size"] / in_bytes) * 100, 1) if in_bytes else 0.0,
        "fit": fit,
    }


def render(ctx: JobContext, params: Dict[str, Any]) -> Dict[str, Any]:
    """One file to ``outPath``, or ``files`` (each with its own ``operations``) into ``outputDir``."""
    opts = OutputOptions.from_dict(params.get("output"))
    ext = gif_render.EXTENSIONS[opts.format]
    if params.get("outPath"):
        jobs = [(params["path"], Path(params["outPath"]), params.get("operations") or {})]
    else:
        out_dir = Path(params["outputDir"])
        per_file = params.get("operations") or {}
        taken: set = set()
        jobs = [(f, unique_path(out_dir / (Path(f).stem + ext), taken), per_file.get(f, {})) for f in params["files"]]

    results: List[Dict[str, Any]] = []
    failed = 0
    for index, (src, out_path, ops) in enumerate(jobs):
        ctx.check_cancelled()
        ctx.progress(index / len(jobs) * 100, "gif_editor.status.rendering",
                     {"file": Path(src).name, "index": index + 1, "total": len(jobs)})
        try:
            item = _render_one(ctx, src, out_path, ops, opts)
        except Exception as exc:  # noqa: BLE001 - one broken file must not stop the batch
            if ctx.cancelled:
                raise
            failed += 1
            ctx.log("gif_editor.log.failed", level="error", file=Path(src).name, error=str(exc))
            continue
        results.append(item)
        ctx.partial(item)
        if item["fit"] and not item["fit"]["reached"]:
            ctx.log("gif_editor.log.targetMissed", level="warning", file=out_path.name,
                    size=gif_render.human_size(item["size"]))

    if not results:
        raise RuntimeError("No file could be processed")
    in_bytes = sum(r["originalSize"] for r in results)
    out_bytes = sum(r["size"] for r in results)
    ctx.progress(100, "gif_editor.status.done")
    ctx.log("gif_editor.log.done", count=len(results))
    return {
        "total": len(jobs),
        "processed": len(results),
        "failed": failed,
        "inBytes": in_bytes,
        "outBytes": out_bytes,
        "savedPercent": round((1 - out_bytes / in_bytes) * 100, 1) if in_bytes else 0.0,
        "outPath": results[0]["dest"],
        "outputDir": str(Path(results[0]["dest"]).parent),
        "files": [r["dest"] for r in results],
        "results": results,
    }
