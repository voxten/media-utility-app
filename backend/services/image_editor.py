"""Image Editor service (Pillow).

Supports single-file & batch resizing, cropping, rotation, flipping,
format preservation and live preview generation.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image, ImageOps

from backend.core import imaging, thumbs
from backend.core.jobs import JobContext
from backend.core.paths import unique_path

RESAMPLE_FILTERS = {
    "lanczos": Image.Resampling.LANCZOS,
    "bicubic": Image.Resampling.BICUBIC,
    "bilinear": Image.Resampling.BILINEAR,
    "nearest": Image.Resampling.NEAREST,
}

# EXIF orientations that swap width and height.
_SIDEWAYS_ORIENTATIONS = {5, 6, 7, 8}


def load_preview(path: str) -> Dict[str, Any]:
    """Inspects an image file and returns metadata and thumbnail data URL."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    with imaging.open_image(p) as img:
        has_alpha = imaging.has_alpha(img)
        w, h = img.width, img.height
        raw_format = (img.format or p.suffix.lstrip(".")).upper()
        # Preview thumbnail
        thumb_data = thumbs.to_data_url(
            img,
            max_size=(1600, 1600),
            fmt="PNG" if has_alpha else "JPEG",
            quality=85,
        )

    return {
        "path": str(p),
        "fileName": p.name,
        "size": p.stat().st_size,
        "width": w,
        "height": h,
        "format": raw_format,
        "hasAlpha": has_alpha,
        "dataUrl": thumb_data,
    }


def thumbnail(path: str, max_side: int = 256) -> Dict[str, Any]:
    """Small preview for file lists; WebP keeps transparency at a fraction of PNG's size."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    with Image.open(p) as img:
        w, h = img.width, img.height
        if img.getexif().get(0x0112) in _SIDEWAYS_ORIENTATIONS:
            w, h = h, w
        fmt = (img.format or p.suffix.lstrip(".")).upper()
        has_alpha = imaging.has_alpha(img)
        # JPEG decoders can scale down while decoding, which skips most of the work for big photos.
        img.draft("RGB", (max_side, max_side))
        upright = ImageOps.exif_transpose(img) or img
        data_url = thumbs.to_data_url(
            upright,
            max_size=(max_side, max_side),
            fmt="WEBP" if has_alpha else "JPEG",
            quality=80,
        )

    return {"width": w, "height": h, "format": fmt, "size": p.stat().st_size, "dataUrl": data_url}

def apply_operations(img: Image.Image, ops: Dict[str, Any]) -> Image.Image:
    """Applies crop, rotate, flip, and resize in the correct order."""
    result = img.copy()

    # 1. Crop (x, y, width, height) in image coordinates
    crop = ops.get("crop")
    if crop and isinstance(crop, dict):
        x = max(0, int(crop.get("x", 0)))
        y = max(0, int(crop.get("y", 0)))
        w = max(1, int(crop.get("width", result.width)))
        h = max(1, int(crop.get("height", result.height)))
        right = min(result.width, x + w)
        bottom = min(result.height, y + h)
        if right > x and bottom > y:
            result = result.crop((x, y, right, bottom))

    # 2. Rotate (clockwise: 90, 180, 270)
    angle = int(ops.get("rotate", 0)) % 360
    if angle == 90:
        result = result.transpose(Image.Transpose.ROTATE_270)
    elif angle == 180:
        result = result.transpose(Image.Transpose.ROTATE_180)
    elif angle == 270:
        result = result.transpose(Image.Transpose.ROTATE_90)
    elif angle != 0:
        result = result.rotate(-angle, expand=True, resample=Image.Resampling.BICUBIC)

    # 3. Flip
    if ops.get("flip_h"):
        result = result.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if ops.get("flip_v"):
        result = result.transpose(Image.Transpose.FLIP_TOP_BOTTOM)

    # 4. Resize
    resize = ops.get("resize")
    if resize and isinstance(resize, dict):
        filter_name = str(resize.get("filter", "lanczos")).lower()
        resample = RESAMPLE_FILTERS.get(filter_name, Image.Resampling.LANCZOS)

        percent = resize.get("percent")
        if percent is not None and int(percent) > 0:
            target_w = max(1, int(result.width * int(percent) / 100))
            target_h = max(1, int(result.height * int(percent) / 100))
            result = result.resize((target_w, target_h), resample=resample)
        elif "width" in resize and "height" in resize:
            target_w = max(1, int(resize["width"]))
            target_h = max(1, int(resize["height"]))
            result = result.resize((target_w, target_h), resample=resample)

    return result


def preview_transform(path: str, ops: Dict[str, Any]) -> Dict[str, Any]:
    """Applies operations in-memory and returns a data URL preview with dimensions."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    with imaging.open_image(p) as img:
        transformed = apply_operations(img, ops)
        has_alpha = imaging.has_alpha(transformed)
        w, h = transformed.width, transformed.height
        thumb_data = thumbs.to_data_url(
            transformed,
            max_size=(1600, 1600),
            fmt="PNG" if has_alpha else "JPEG",
            quality=88,
        )

    return {
        "width": w,
        "height": h,
        "hasAlpha": has_alpha,
        "dataUrl": thumb_data,
    }


def save_transformed(
    src_path: str,
    target_path: str,
    ops: Dict[str, Any],
    out_fmt: Optional[str] = None,
    quality: int = 90,
) -> Dict[str, Any]:
    """Applies operations and saves the resulting image to disk."""
    src = Path(src_path)
    if not src.is_file():
        raise FileNotFoundError(f"File not found: {src_path}")

    target = Path(target_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    with imaging.open_image(src) as img:
        orig_format = (img.format or src.suffix.lstrip(".")).lower()
        transformed = apply_operations(img, ops)

        fmt = imaging.normalize_format(out_fmt or orig_format or "png")
        work_img = imaging.prepare_for_format(transformed, fmt)

        save_kwargs: Dict[str, Any] = {}
        if fmt in ("jpeg", "webp"):
            save_kwargs["quality"] = quality

        work_img.save(target, imaging.pil_format(fmt), **save_kwargs)

    return {
        "outPath": str(target),
        "width": work_img.width,
        "height": work_img.height,
        "bytes": target.stat().st_size,
    }


def batch_process(
    ctx: JobContext,
    files: List[str],
    output_dir: str,
    ops: Any,
    out_fmt: Optional[str] = None,
    quality: int = 90,
) -> Dict[str, Any]:
    """Batch processes a list of image files applying transforms (global or per-file)."""
    ctx.progress(0, "imageTools.status.starting")
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    total = len(files)
    processed = 0
    failed = 0
    results: List[Dict[str, Any]] = []

    for idx, f in enumerate(files):
        ctx.check_cancelled()
        src = Path(f)
        if not src.is_file():
            failed += 1
            ctx.log("imageTools.log.missing", "error", file=f)
            continue

        ctx.progress(int((idx / total) * 100), "imageTools.status.processing", {"index": idx + 1, "total": total})

        # Resolve operations for this specific file
        file_ops: Dict[str, Any] = {}
        if isinstance(ops, dict) and str(src) in ops:
            file_ops = ops[str(src)]
        elif isinstance(ops, dict) and src.name in ops:
            file_ops = ops[src.name]
        elif isinstance(ops, list) and idx < len(ops):
            file_ops = ops[idx]
        elif isinstance(ops, dict):
            file_ops = ops

        ext = imaging.extension(out_fmt or src.suffix or "png")
        target = unique_path(out_dir / f"{src.stem}_edited.{ext}")

        try:
            res = save_transformed(str(src), str(target), file_ops, out_fmt=out_fmt, quality=quality)
            results.append({
                "file": str(src),
                "dest": str(target),
                "width": res["width"],
                "height": res["height"],
                "bytes": res["bytes"],
            })
            processed += 1
        except Exception as e:
            failed += 1
            ctx.log("imageTools.log.failed", "error", file=src.name, error=str(e))

    ctx.progress(100, "imageTools.status.done")
    return {
        "total": total,
        "processed": processed,
        "failed": failed,
        "outputDir": str(out_dir),
        "files": [r["dest"] for r in results],
        "results": results,
    }
