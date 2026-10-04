"""Smart Image Compressor & Optimizer service (Pillow).

Supports lossless, lossy (WebP/JPEG/PNG quantize) and target-size bisection compression
with live preview comparison and batch processing.
"""

import base64
import io
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

from backend.core import thumbs
from backend.core.jobs import JobContext

SUPPORTED_INPUT_FORMATS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"}
ALPHA_FORMATS = {"png", "webp"}


def _has_alpha(img: Image.Image) -> bool:
    return img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)


def load_preview(path: str) -> Dict[str, Any]:
    """Inspects image and returns dimensions, file size and data URL preview."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    with Image.open(p) as img:
        has_alpha = _has_alpha(img)
        w, h = img.width, img.height
        raw_format = (img.format or p.suffix.lstrip(".")).upper()
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
    strip_metadata: bool = True,
) -> Tuple[bytes, str]:
    """Compresses a PIL Image in memory and returns (bytes, mime_type)."""
    fmt = fmt.lower()
    if fmt == "jpg":
        fmt = "jpeg"

    # Handle Alpha channel
    if fmt == "jpeg":
        if _has_alpha(img):
            # Create a clean white background for JPEG
            bg = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode != "RGBA":
                img = img.convert("RGBA")
            bg.paste(img, mask=img.split()[3])
            work_img = bg
        elif img.mode != "RGB":
            work_img = img.convert("RGB")
        else:
            work_img = img
    elif fmt in ALPHA_FORMATS and _has_alpha(img):
        work_img = img.convert("RGBA") if img.mode != "RGBA" else img
    elif img.mode != "RGB":
        work_img = img.convert("RGB")
    else:
        work_img = img

    buf = io.BytesIO()

    if fmt == "webp":
        if mode == "lossless":
            work_img.save(buf, "WEBP", lossless=True, method=6)
        else:
            work_img.save(buf, "WEBP", quality=quality, method=6)
        mime = "webp"

    elif fmt == "jpeg":
        if mode == "lossless":
            work_img.save(buf, "JPEG", quality=95, optimize=True, progressive=True)
        else:
            work_img.save(
                buf,
                "JPEG",
                quality=quality,
                optimize=True,
                progressive=True,
                subsampling="4:2:0" if quality <= 85 else "4:4:4",
            )
        mime = "jpeg"

    elif fmt == "png":
        if mode == "smart" and not _has_alpha(work_img):
            # Quantize 24-bit to 8-bit palette with Floyd-Steinberg dithering for massive savings
            quantized = work_img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
            quantized.save(buf, "PNG", optimize=True, compress_level=9)
        else:
            work_img.save(buf, "PNG", optimize=True, compress_level=9)
        mime = "png"

    else:
        work_img.save(buf, fmt.upper())
        mime = fmt

    return buf.getvalue(), mime


def _find_target_quality(
    img: Image.Image,
    fmt: str,
    target_bytes: int,
) -> Tuple[bytes, str]:
    """Finds best quality setting using binary search to fit within target_bytes."""
    low, high = 10, 95
    best_buf = None
    best_mime = "jpeg"

    # Step 1: Bisection on quality
    for _ in range(7):
        mid = (low + high) // 2
        data, mime = _compress_to_buffer(img, fmt, mode="smart", quality=mid)
        best_mime = mime
        if len(data) <= target_bytes:
            best_buf = data
            low = mid + 1  # Try higher quality
        else:
            high = mid - 1  # Reduce quality

    # Step 2: If even lowest quality is too big, scale image dimensions down
    if best_buf is None or len(best_buf) > target_bytes:
        current_img = img
        scale = 0.85
        while scale >= 0.2:
            new_w = max(16, int(img.width * scale))
            new_h = max(16, int(img.height * scale))
            scaled = current_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            data, mime = _compress_to_buffer(scaled, fmt, mode="smart", quality=60)
            if len(data) <= target_bytes:
                return data, mime
            scale -= 0.15
        # Return smallest produced
        return _compress_to_buffer(img, fmt, mode="smart", quality=15)

    return best_buf, best_mime


def preview_compress(path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Compresses an image in-memory to provide instant visual and size comparison."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    in_bytes = p.stat().st_size
    out_fmt = params.get("format", "original").lower()
    if out_fmt == "original":
        out_fmt = p.suffix.lstrip(".").lower()
    if out_fmt == "jpg":
        out_fmt = "jpeg"

    mode = params.get("mode", "smart")  # smart | lossless | target
    quality = int(params.get("quality", 80))
    target_kb = params.get("targetKb")

    with Image.open(p) as img:
        if mode == "target" and target_kb:
            target_bytes = int(target_kb) * 1024
            data, mime = _find_target_quality(img, out_fmt, target_bytes)
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

        # Determine output format and extension
        if out_fmt_choice == "original":
            out_fmt = src.suffix.lstrip(".").lower()
        else:
            out_fmt = out_fmt_choice
        if out_fmt == "jpg":
            out_fmt = "jpeg"
        ext = "jpg" if out_fmt == "jpeg" else out_fmt

        if single_out_path and total == 1:
            dest = Path(single_out_path)
        else:
            dest = out_dir_path / f"{src.stem}_compressed.{ext}"

        try:
            with Image.open(src) as img:
                if mode == "target" and target_bytes:
                    data, _ = _find_target_quality(img, out_fmt, target_bytes)
                else:
                    data, _ = _compress_to_buffer(img, out_fmt, mode=mode, quality=quality)

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
            }
            results.append(res_item)
            ctx.partial(res_item)
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
        "outPath": str(single_out_path) if single_out_path and total == 1 else None,
        "files": [r["dest"] for r in results],
        "results": results,
    }
