"""AI Background Removal service supporting BiRefNet / RMBG with anti-halo debleed and despeckling."""

import io
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np
from PIL import Image

from backend.core import thumbs
from backend.core.jobs import JobCancelled, JobContext
from backend.core.paths import app_data_dir, cache_dir

logger = logging.getLogger(__name__)

SUPPORTED_FORMATS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif")
_SESSIONS: Dict[str, Any] = {}

MODEL_MAP = {
    "birefnet": "birefnet-general",
    "birefnet-lite": "birefnet-general-lite",
    "isnet": "isnet-general-use",
    "u2net": "u2net",
}


def is_available() -> bool:
    """Checks if rembg and onnxruntime are installed and importable."""
    try:
        import onnxruntime  # noqa: F401
        import rembg  # noqa: F401

        return True
    except (ImportError, Exception):
        return False


def _get_rembg_session(model_name: str) -> Any:
    """Caches rembg session to avoid reloading ONNX models on every invocation."""
    resolved_model = MODEL_MAP.get(model_name, model_name)
    if resolved_model in _SESSIONS:
        return _SESSIONS[resolved_model]

    # Ensure models are stored in %APPDATA%/MediaStudio/models
    models_dir = app_data_dir() / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    os.environ["U2NET_HOME"] = str(models_dir)

    import rembg

    session = rembg.new_session(resolved_model)
    _SESSIONS[resolved_model] = session
    return session


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


def filter_small_components(alpha: np.ndarray, min_area_ratio: float = 0.002, fill_holes: bool = True) -> np.ndarray:
    """Removes small floating remnant specks and fills accidental holes in the mask."""
    _, binary = cv2.threshold(alpha, 127, 255, cv2.THRESH_BINARY)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)

    filtered_alpha = alpha.copy()

    if num_labels > 2:
        # Find largest foreground component (label 0 is background)
        areas = stats[1:, cv2.CC_STAT_AREA]
        max_area = int(np.max(areas)) if len(areas) > 0 else 0
        min_allowed_area = max(80, int(max_area * min_area_ratio))

        keep_mask = np.zeros_like(binary)
        for i in range(1, num_labels):
            if stats[i, cv2.CC_STAT_AREA] >= min_allowed_area:
                keep_mask[labels == i] = 255

        # Dilate slightly so soft edge gradients are preserved
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        keep_mask_dilated = cv2.dilate(keep_mask, kernel)
        filtered_alpha = np.where(keep_mask_dilated > 0, filtered_alpha, 0).astype(np.uint8)

    if fill_holes:
        # Fill small holes in the subject
        inv_binary = cv2.bitwise_not(binary)
        num_holes, hole_labels, hole_stats, _ = cv2.connectedComponentsWithStats(inv_binary, connectivity=4)
        h, w = binary.shape[:2]
        for i in range(1, num_holes):
            hx, hy, hw, hh, harea = hole_stats[i]
            # Don't fill background that touches edges
            if hx > 0 and hy > 0 and (hx + hw) < w and (hy + hh) < h:
                if harea < max(120, int(binary.size * 0.015)):
                    filtered_alpha[hole_labels == i] = 255

    return filtered_alpha


def clean_alpha_halos(
    bgr: np.ndarray,
    alpha: np.ndarray,
    choke_px: int = 1,
    debleed: bool = True,
    feather_px: int = 0,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Eliminates white edge halos and color bleeding:
    1. Choke/Erode: Shaves the outermost 1-3 contaminated boundary pixels.
    2. Feather: Softens harsh aliased steps if requested.
    3. Anti-halo debleed: Inpaints the transitional semi-transparent border (alpha < 240)
       using the clean foreground color from the solid interior (alpha >= 240).
    """
    refined_alpha = alpha.copy()

    # 1. Choke (subpixel edge trimming)
    if choke_px > 0:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * choke_px + 1, 2 * choke_px + 1))
        refined_alpha = cv2.erode(refined_alpha, kernel)

    # 2. Feathering
    if feather_px > 0:
        ksize = 2 * feather_px + 1
        refined_alpha = cv2.GaussianBlur(refined_alpha, (ksize, ksize), 0)

    cleaned_bgr = bgr.copy()

    # 3. Anti-halo Color Decontamination (Debleed)
    if debleed:
        solid_fg = refined_alpha >= 235
        semi_edge = (refined_alpha > 0) & (~solid_fg)

        if np.any(solid_fg) and np.any(semi_edge):
            # Inpaint outward: replace colors in non-solid areas with colors from solid foreground
            inpaint_mask = (~solid_fg).astype(np.uint8) * 255
            try:
                inpainted = cv2.inpaint(bgr, inpaint_mask, inpaintRadius=4, flags=cv2.INPAINT_TELEA)
                # Keep inpainted colors on the edge transition zone
                cleaned_bgr = np.where(semi_edge[:, :, None], inpainted, cleaned_bgr)
            except Exception as e:
                logger.warning("Anti-halo debleed fallback: %s", e)

    return cleaned_bgr, refined_alpha


def apply_touchup_mask(alpha: np.ndarray, touchup_data_url: str, shape: Tuple[int, int]) -> np.ndarray:
    """Applies user manual touch-up canvas mask (erase / restore strokes)."""
    if not touchup_data_url:
        return alpha
    try:
        raw_bytes = thumbs.decode_data_url(touchup_data_url)
        touch_img = cv2.imdecode(np.frombuffer(raw_bytes, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
        if touch_img is None:
            return alpha

        if touch_img.shape[:2] != shape:
            touch_img = cv2.resize(touch_img, (shape[1], shape[0]), interpolation=cv2.INTER_NEAREST)

        # In the UI canvas:
        # Red strokes (R > 180, B < 80) = Erase (set alpha = 0)
        # Green strokes (G > 180, R < 80) = Restore (set alpha = 255)
        if touch_img.ndim == 3 and touch_img.shape[2] >= 3:
            b, g, r = touch_img[:, :, 0], touch_img[:, :, 1], touch_img[:, :, 2]
            alpha_ch = touch_img[:, :, 3] if touch_img.shape[2] == 4 else np.full_like(r, 255)

            is_stroke = alpha_ch > 20
            erase_mask = is_stroke & (r > 160) & (b < 100) & (g < 100)
            restore_mask = is_stroke & (g > 160) & (r < 100)

            result_alpha = alpha.copy()
            result_alpha[erase_mask] = 0
            result_alpha[restore_mask] = 255
            return result_alpha
    except Exception as e:
        logger.warning("Failed applying touchup mask: %s", e)
    return alpha


def load_preview(path: str) -> Dict[str, Any]:
    """Loads image and returns dimensions and preview Data URL."""
    img = read_image(path)
    bgr, alpha = split_alpha(img)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    if alpha is not None:
        rgb = np.dstack([rgb, alpha])

    return {
        "path": path,
        "width": int(img.shape[1]),
        "height": int(img.shape[0]),
        "dataUrl": thumbs.to_data_url(rgb, max_size=None, fmt="PNG"),
    }


def remove(ctx: JobContext, params: Dict[str, Any]) -> Dict[str, Any]:
    """Executes AI background removal with anti-halo and despeckle post-processing."""
    if not is_available():
        raise RuntimeError("Rembg / ONNX Runtime dependencies are not installed.")

    import rembg

    t0 = time.time()
    path = params["path"]
    model_name = params.get("model", "birefnet")
    anti_halo = bool(params.get("antiHalo", True))
    choke_px = int(params.get("choke", 1))
    feather_px = int(params.get("feather", 0))
    despeckle = bool(params.get("despeckle", True))
    user_mask = params.get("userMask")

    ctx.progress(5, "rembg.status.loading")
    img = read_image(path)
    bgr, _ = split_alpha(img)
    h, w = bgr.shape[:2]

    ctx.check_cancelled()
    ctx.progress(15, "rembg.status.preparingModel", {"model": model_name})
    session = _get_rembg_session(model_name)

    ctx.check_cancelled()
    ctx.progress(30, "rembg.status.inferring")

    # Run AI inference to extract alpha mask
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    pil_in = Image.fromarray(rgb)

    # only_mask=True returns a grayscale PIL image with the predicted alpha map
    mask_pil = rembg.remove(pil_in, session=session, only_mask=True)
    raw_alpha = np.array(mask_pil)
    if raw_alpha.shape[:2] != (h, w):
        raw_alpha = cv2.resize(raw_alpha, (w, h), interpolation=cv2.INTER_LINEAR)

    ctx.check_cancelled()
    ctx.progress(70, "rembg.status.refiningEdges")

    # Step 1: Despeckle / small remnant filtering
    processed_alpha = raw_alpha
    if despeckle:
        processed_alpha = filter_small_components(processed_alpha)

    # Step 2: Anti-halo debleed and choke/feather
    cleaned_bgr, final_alpha = clean_alpha_halos(
        bgr,
        processed_alpha,
        choke_px=choke_px,
        debleed=anti_halo,
        feather_px=feather_px,
    )

    # Step 3: Apply interactive touch-up mask if present
    if user_mask:
        final_alpha = apply_touchup_mask(final_alpha, user_mask, (h, w))

    ctx.check_cancelled()
    ctx.progress(90, "rembg.status.compositing")

    # Combine into BGRA
    result_bgra = cv2.merge([cleaned_bgr, final_alpha])

    # Cache full resolution result
    result_path = cache_dir() / f"rembg_{uuid.uuid4().hex[:10]}.png"
    write_image(result_bgra, str(result_path))

    # Build preview data URL
    result_rgba = cv2.cvtColor(result_bgra, cv2.COLOR_BGRA2RGBA)
    preview_url = thumbs.to_data_url(result_rgba, max_size=None, fmt="PNG")

    ctx.progress(100, "rembg.status.done")
    return {
        "resultPath": str(result_path),
        "dataUrl": preview_url,
        "width": w,
        "height": h,
        "elapsed": round(time.time() - t0, 2),
    }


def save_result(result_path: str, out_path: str) -> str:
    """Saves cached background removal result to the target file path."""
    img = read_image(result_path)
    return write_image(img, out_path)
