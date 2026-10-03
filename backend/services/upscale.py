"""AI Super-Resolution service supporting RGBA transparent backgrounds and anti-halo debleeding."""

import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np
import torch

from backend.core import thumbs
from backend.core.jobs import JobCancelled, JobContext
from backend.core.paths import app_data_dir, cache_dir, project_root
from backend.services.ai_models import load_upscale_model

SUPPORTED_FORMATS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif")


def get_model_weights_path(model_id: str) -> Optional[Path]:
    """Finds downloaded weights for the specified model in %APPDATA%/MediaStudio/models or project root."""
    filename = "realesr-general-x4v3.pth" if model_id == "general" else "RealESRGAN_x4plus_anime_6B.pth"
    candidates = [
        app_data_dir() / "models" / filename,
        Path.home() / ".cache" / "torch" / "hub" / "checkpoints" / filename,
        project_root() / "models" / filename,
    ]
    for p in candidates:
        if p.is_file() and p.stat().st_size > 1_000_000:
            return p
    return None


def is_model_available(model_id: str) -> bool:
    if model_id in ("lanczos", "bicubic", "nearest"):
        return True
    return get_model_weights_path(model_id) is not None


def read_image(path: str) -> np.ndarray:
    """Unicode-safe image reader preserving alpha channel."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(path)
    data = np.fromfile(path, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot decode image: {path}")
    return img


def write_image(img: np.ndarray, path: str) -> str:
    ext = Path(path).suffix.lower()
    if ext not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported output format: {ext}")
    # Drop alpha if saving as JPEG / BMP
    if ext in (".jpg", ".jpeg", ".bmp") and img.ndim == 3 and img.shape[2] == 4:
        img = img[:, :, :3]
    ok, buf = cv2.imencode(ext, img)
    if not ok:
        raise ValueError(f"Cannot encode image as {ext}")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    buf.tofile(path)
    return path


def split_alpha(img: np.ndarray) -> Tuple[np.ndarray, Optional[np.ndarray]]:
    """Splits image into (BGR, Alpha)."""
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), None
    if img.shape[2] == 4:
        return img[:, :, :3].copy(), img[:, :, 3].copy()
    if img.shape[2] == 3:
        return img, None
    raise ValueError(f"Unsupported channel count: {img.shape[2]}")


def anti_halo_debleed(bgr: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Eliminates dark borders around transparent edges by expanding edge colors into zero-alpha areas."""
    if alpha is None or not np.any(alpha == 0):
        return bgr

    # Inpaint the zero-alpha areas using color from boundary visible pixels
    mask = (alpha == 0).astype(np.uint8)
    # Fast inpainting replaces zero-alpha background color with adjacent edge color
    try:
        cleaned_bgr = cv2.inpaint(bgr, mask, 3, cv2.INPAINT_TELEA)
        return cleaned_bgr
    except Exception:
        return bgr


def _process_tiles(
    model: torch.nn.Module,
    device: str,
    img_bgr: np.ndarray,
    tile_size: int = 512,
    tile_pad: int = 16,
    scale: int = 4,
    ctx: Optional[JobContext] = None,
) -> np.ndarray:
    """Processes image in overlapping tiles to prevent out-of-memory errors on large images."""
    h, w, c = img_bgr.shape
    out_h, out_w = h * scale, w * scale

    # If small enough, run direct forward pass
    if h <= 1024 and w <= 1024:
        rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        tensor = torch.from_numpy(rgb).permute(2, 0, 1).unsqueeze(0).float().to(device) / 255.0
        with torch.no_grad():
            out_tensor = model(tensor)
        out_rgb = out_tensor[0].permute(1, 2, 0).clamp(0, 1).detach().cpu().numpy()
        out_bgr = cv2.cvtColor((out_rgb * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
        return out_bgr

    # Tile processing
    output = np.zeros((out_h, out_w, c), dtype=np.uint8)
    tiles_x = int(np.ceil(w / tile_size))
    tiles_y = int(np.ceil(h / tile_size))
    total_tiles = tiles_x * tiles_y
    processed = 0

    for yi in range(tiles_y):
        for xi in range(tiles_x):
            if ctx:
                ctx.check_cancelled()
            # Crop tile with padding
            x_start = xi * tile_size
            x_end = min(x_start + tile_size, w)
            y_start = yi * tile_size
            y_end = min(y_start + tile_size, h)

            pad_x0 = max(0, x_start - tile_pad)
            pad_x1 = min(w, x_end + tile_pad)
            pad_y0 = max(0, y_start - tile_pad)
            pad_y1 = min(h, y_end + tile_pad)

            tile_in = img_bgr[pad_y0:pad_y1, pad_x0:pad_x1]
            tile_rgb = cv2.cvtColor(tile_in, cv2.COLOR_BGR2RGB)
            t_in = torch.from_numpy(tile_rgb).permute(2, 0, 1).unsqueeze(0).float().to(device) / 255.0

            with torch.no_grad():
                t_out = model(t_in)

            tile_out_rgb = t_out[0].permute(1, 2, 0).clamp(0, 1).detach().cpu().numpy()
            tile_out_bgr = cv2.cvtColor((tile_out_rgb * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)

            # Crop out the padding
            crop_y0 = (y_start - pad_y0) * scale
            crop_y1 = crop_y0 + (y_end - y_start) * scale
            crop_x0 = (x_start - pad_x0) * scale
            crop_x1 = crop_x0 + (x_end - x_start) * scale

            tile_valid = tile_out_bgr[crop_y0:crop_y1, crop_x0:crop_x1]
            output[y_start * scale : y_end * scale, x_start * scale : x_end * scale] = tile_valid

            processed += 1
            if ctx:
                pct = 20 + int(processed * 60 / total_tiles)
                ctx.progress(
                    pct,
                    "upscale.status.tiling",
                    {"tile": processed, "total": total_tiles, "percent": pct},
                )

    return output


def upscale_array(
    img: np.ndarray,
    model_id: str = "general",
    scale: int = 4,
    alpha_mode: str = "smooth",
    anti_halo: bool = True,
    ctx: Optional[JobContext] = None,
) -> np.ndarray:
    """Upscales image array with full support for RGBA transparency."""
    orig_h, orig_w = img.shape[:2]
    out_w, out_h = orig_w * scale, orig_h * scale

    # Classical interpolation (no AI required)
    if model_id == "lanczos":
        return cv2.resize(img, (out_w, out_h), interpolation=cv2.INTER_LANCZOS4)
    if model_id == "bicubic":
        return cv2.resize(img, (out_w, out_h), interpolation=cv2.INTER_CUBIC)
    if model_id == "nearest":
        return cv2.resize(img, (out_w, out_h), interpolation=cv2.INTER_NEAREST)

    # AI Models
    weights_path = get_model_weights_path(model_id)
    if not weights_path:
        raise FileNotFoundError(f"Model weights for '{model_id}' are not installed.")

    bgr, alpha = split_alpha(img)

    # Pre-process colors to prevent dark halo around transparent edges
    if alpha is not None and anti_halo:
        if ctx:
            ctx.progress(10, "upscale.status.debleeding")
        bgr_processed = anti_halo_debleed(bgr, alpha)
    else:
        bgr_processed = bgr

    if ctx:
        ctx.check_cancelled()
        ctx.progress(20, "upscale.status.modelInference")

    model, device = load_upscale_model(model_id, str(weights_path))
    # Native model upscales 4x
    out_bgr_4x = _process_tiles(model, device, bgr_processed, scale=4, ctx=ctx)

    # Scale adjustment if user requested 2x instead of native 4x
    if scale == 2:
        out_bgr = cv2.resize(out_bgr_4x, (out_w, out_h), interpolation=cv2.INTER_AREA)
    else:
        out_bgr = out_bgr_4x

    # Process Alpha channel
    if alpha is not None:
        if ctx:
            ctx.progress(85, "upscale.status.alphaProcessing")
        if alpha_mode == "ai":
            # Run alpha as 3-channel grayscale through neural model for sharp anime/vector mask
            alpha_3ch = cv2.cvtColor(alpha, cv2.COLOR_GRAY2BGR)
            alpha_4x = _process_tiles(model, device, alpha_3ch, scale=4, ctx=ctx)
            alpha_out_gray = cv2.cvtColor(alpha_4x, cv2.COLOR_BGR2GRAY)
            if scale == 2:
                alpha_final = cv2.resize(alpha_out_gray, (out_w, out_h), interpolation=cv2.INTER_AREA)
            else:
                alpha_final = alpha_out_gray
        else:
            # Smooth Lanczos-4 interpolation preserves anti-aliased gradients
            alpha_final = cv2.resize(alpha, (out_w, out_h), interpolation=cv2.INTER_LANCZOS4)

        result = cv2.merge([out_bgr, alpha_final])
    else:
        result = out_bgr

    if ctx:
        ctx.progress(100, "upscale.status.done")
    return result


def load_preview(path: str) -> Dict[str, Any]:
    """Inspects image and returns dimensions, transparency info, and preview data URL."""
    img = read_image(path)
    bgr, alpha = split_alpha(img)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    if alpha is not None:
        rgba = np.dstack([rgb, alpha])
    else:
        rgba = rgb

    return {
        "path": path,
        "width": int(img.shape[1]),
        "height": int(img.shape[0]),
        "hasAlpha": alpha is not None,
        "dataUrl": thumbs.to_data_url(rgba, max_size=(1200, 1200), fmt="PNG"),
    }


def upscale(
    ctx: JobContext,
    image_path: str,
    model_id: str = "general",
    scale: int = 4,
    alpha_mode: str = "smooth",
    anti_halo: bool = True,
) -> Dict[str, Any]:
    """Runs upscale job and returns cached result handle with preview."""
    ctx.progress(None, "upscale.status.loading")
    img = read_image(image_path)
    ctx.check_cancelled()

    result_img = upscale_array(
        img,
        model_id=model_id,
        scale=scale,
        alpha_mode=alpha_mode,
        anti_halo=anti_halo,
        ctx=ctx,
    )

    ctx.check_cancelled()
    result_path = cache_dir() / f"upscale_{uuid.uuid4().hex[:10]}.png"
    write_image(result_img, str(result_path))

    # Generate preview for UI
    bgr, alpha = split_alpha(result_img)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    rgba = np.dstack([rgb, alpha]) if alpha is not None else rgb

    return {
        "resultPath": str(result_path),
        "width": int(result_img.shape[1]),
        "height": int(result_img.shape[0]),
        "hasAlpha": alpha is not None,
        "dataUrl": thumbs.to_data_url(rgba, max_size=(1200, 1200), fmt="PNG"),
    }


def save_result(result_path: str, out_path: str) -> str:
    """Exports cached result to user-chosen path."""
    return write_image(read_image(result_path), out_path)
