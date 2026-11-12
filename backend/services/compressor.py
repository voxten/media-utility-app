"""Smart Image Compressor & Optimizer service (Pillow).

Supports lossless, lossy (WebP/JPEG/PNG quantize) and target-size bisection compression
with live preview comparison and batch processing.
"""

import base64
import io
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

from backend.core import imaging, thumbs
from backend.core.jobs import JobContext
from backend.core.paths import unique_path

SUPPORTED_INPUT_FORMATS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"}


def load_preview(path: str) -> Dict[str, Any]:
    """Inspects image and returns dimensions, file size and data URL preview."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    with imaging.open_image(p) as img:
        has_alpha = imaging.has_alpha(img)
        w, h = img.width, img.height
        raw_format = imaging.pil_format(img.format or p.suffix)
        # Preview thumbnail
        thumb_data = thumbs.to_data_url(img, max_size=(1200, 1200), fmt="PNG" if has_alpha else "JPEG")

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


def _compress_to_buffer(
    img: Image.Image,
    fmt: str,
    mode: str = "smart",
    quality: int = 80,
) -> Tuple[bytes, str]:
    """Compresses a PIL Image in memory and returns (bytes, mime_type).

    Only the colour profile is carried over; EXIF and other metadata are dropped.
    """
    fmt = imaging.normalize_format(fmt)
    work_img = imaging.prepare_for_format(img, fmt)
    icc = imaging.color_profile(img, fmt)

    buf = io.BytesIO()

    if fmt == "webp":
        if mode == "lossless":
            work_img.save(buf, "WEBP", lossless=True, method=6, **icc)
        else:
            work_img.save(buf, "WEBP", quality=quality, method=6, **icc)
        mime = "webp"

    elif fmt == "jpeg":
        if mode == "lossless":
            work_img.save(buf, "JPEG", quality=95, optimize=True, progressive=True, **icc)
        else:
            work_img.save(
                buf,
                "JPEG",
                quality=quality,
                optimize=True,
                progressive=True,
                subsampling="4:2:0" if quality <= 85 else "4:4:4",
                **icc,
            )
        mime = "jpeg"

    elif fmt == "png":
        if mode == "smart" and not imaging.has_alpha(work_img):
            # Quantize 24-bit to 8-bit palette with Floyd-Steinberg dithering for massive savings
            quantized = work_img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
            quantized.save(buf, "PNG", optimize=True, compress_level=9, **icc)
        else:
            work_img.save(buf, "PNG", optimize=True, compress_level=9, **icc)
        mime = "png"

    else:
        work_img.save(buf, imaging.pil_format(fmt), **icc)
        mime = fmt

    return buf.getvalue(), mime


# Formats whose encoder has a quality setting; for the others only scaling can reach a size.
_QUALITY_FORMATS = {"jpeg", "webp"}


def _find_target_quality(
    img: Image.Image,
    fmt: str,
    target_bytes: int,
) -> Tuple[bytes, str, bool]:
    """The best encoding that fits ``target_bytes``: highest quality first, then smaller dimensions.

    Returns ``(data, mime, reached)``; when nothing fits, the smallest encoding produced.
    """
    fmt = imaging.normalize_format(fmt)
    smallest: Optional[Tuple[bytes, str]] = None

    def keep(data: bytes, mime: str) -> None:
        nonlocal smallest
        if smallest is None or len(data) < len(smallest[0]):
            smallest = (data, mime)

    if fmt in _QUALITY_FORMATS:
        best: Optional[Tuple[bytes, str]] = None
        low, high = 10, 95
        while low <= high:
            mid = (low + high) // 2
            data, mime = _compress_to_buffer(img, fmt, mode="smart", quality=mid)
            keep(data, mime)
            if len(data) <= target_bytes:
                best = (data, mime)
                low = mid + 1
            else:
                high = mid - 1
        if best:
            return best[0], best[1], True
    else:
        data, mime = _compress_to_buffer(img, fmt, mode="smart")
        keep(data, mime)
        if len(data) <= target_bytes:
            return data, mime, True

    scale = 0.85
    while scale >= 0.2:
        scaled = img.resize((max(16, int(img.width * scale)), max(16, int(img.height * scale))), Image.Resampling.LANCZOS)
        data, mime = _compress_to_buffer(scaled, fmt, mode="smart", quality=60)
        keep(data, mime)
        if len(data) <= target_bytes:
            return data, mime, True
        scale -= 0.15
    assert smallest is not None
    return smallest[0], smallest[1], False


def preview_compress(path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Compresses an image in-memory to provide instant visual and size comparison."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    in_bytes = p.stat().st_size
    out_fmt = params.get("format", "original").lower()
    out_fmt = imaging.normalize_format(p.suffix if out_fmt == "original" else out_fmt)

    mode = params.get("mode", "smart")  # smart | lossless | target
    quality = int(params.get("quality", 80))
    target_kb = params.get("targetKb")

    with imaging.open_image(p) as img:
        if mode == "target" and target_kb:
            target_bytes = int(target_kb) * 1024
            data, mime, _ = _find_target_quality(img, out_fmt, target_bytes)
        else:
            data, mime = _compress_to_buffer(img, out_fmt, mode=mode, quality=quality)

    out_bytes = len(data)
    saved_bytes = max(0, in_bytes - out_bytes)
    saved_percent = round(saved_bytes / in_bytes * 100, 1) if in_bytes > 0 else 0.0

    # Create data URL for preview
    data_url = f"data:image/{mime};base64,{base64.b64encode(data).decode('ascii')}"

    return {
        "compressedBytes": out_bytes,
        "savedBytes": saved_bytes,
        "savedPercent": saved_percent,
        "dataUrl": data_url,
    }


def compress(ctx: JobContext, params: Dict[str, Any]) -> Dict[str, Any]:
    """Job runner for compressing either a single file or a batch of files."""
    files: List[str] = list(params.get("files") or [])
    if not files and params.get("path"):
        files = [str(params["path"])]

    if not files:
        raise ValueError("No files provided for compression")

    out_fmt_choice = params.get("format", "original").lower()
    mode = params.get("mode", "smart")
    quality = int(params.get("quality", 80))
    target_kb = params.get("targetKb")
    target_bytes = int(target_kb) * 1024 if target_kb else None

    # Destination
    output_dir = params.get("outputDir")
    single_out_path = params.get("outPath")

    if output_dir:
        out_dir_path = Path(output_dir)
        out_dir_path.mkdir(parents=True, exist_ok=True)
    elif single_out_path:
        out_dir_path = Path(single_out_path).parent
        out_dir_path.mkdir(parents=True, exist_ok=True)
    else:
        raise ValueError("Either outputDir or outPath must be specified")

    total = len(files)
    total_in = 0
    total_out = 0
    processed = 0
    failed = 0
    results: List[Dict[str, Any]] = []

    for idx, f_path in enumerate(files):
        ctx.check_cancelled()
        src = Path(f_path)
        if not src.is_file():
            failed += 1
            continue

        in_size = src.stat().st_size
        total_in += in_size
        ctx.progress(idx / total * 100, "compressor.status.processing", {"file": src.name, "index": idx + 1, "total": total})

        keep_format = out_fmt_choice == "original"
        out_fmt = imaging.normalize_format(src.suffix if keep_format else out_fmt_choice)
        ext = src.suffix.lstrip(".").lower() if keep_format else imaging.extension(out_fmt)

        if single_out_path and total == 1:
            dest = Path(single_out_path)
        else:
            dest = unique_path(out_dir_path / f"{src.stem}_compressed.{ext}")

        try:
            reached = True
            with imaging.open_image(src) as img:
                if mode == "target" and target_bytes:
                    data, _, reached = _find_target_quality(img, out_fmt, target_bytes)
                else:
                    data, _ = _compress_to_buffer(img, out_fmt, mode=mode, quality=quality)

            # In its own format, a result that is not smaller is worse than the file itself.
            no_gain = out_fmt == imaging.normalize_format(src.suffix) and len(data) >= in_size
            if no_gain:
                data = src.read_bytes()
                ctx.log("compressor.log.noGain", "warning", name=src.name)
            elif not reached:
                ctx.log("compressor.log.targetMissed", "warning", name=src.name, size=f"{len(data) // 1024} KB")
            dest.write_bytes(data)
            out_size = len(data)
            total_out += out_size
            processed += 1
            saved = max(0, in_size - out_size)
            pct = round(saved / in_size * 100, 1) if in_size > 0 else 0.0

            res_item = {
                "file": str(src),
                "dest": str(dest),
                "inBytes": in_size,
                "outBytes": out_size,
                "savedPercent": pct,
                "noGain": no_gain,
            }
            results.append(res_item)
            ctx.partial(res_item)
            if not no_gain:
                ctx.log("compressor.log.done", "info", name=src.name, saved=f"-{pct}%")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            ctx.log("compressor.log.error", "error", file=src.name, error=str(exc))

    ctx.progress(100, "compressor.status.done")
    saved_total = max(0, total_in - total_out)
    saved_pct = round(saved_total / total_in * 100, 1) if total_in > 0 else 0.0

    return {
        "total": total,
        "processed": processed,
        "failed": failed,
        "inBytes": total_in,
        "outBytes": total_out,
        "savedBytes": saved_total,
        "savedPercent": saved_pct,
        "outputDir": str(out_dir_path),
        "outPath": results[0]["dest"] if total == 1 and results else None,
        "files": [r["dest"] for r in results],
        "results": results,
    }
