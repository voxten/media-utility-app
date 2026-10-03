"""Watermark removal by inpainting a user-painted mask (OpenCV, optionally LaMa via IOPaint)."""

import importlib.util
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

import cv2
import numpy as np

from backend.core import thumbs
from backend.core.jobs import JobContext
from backend.core.paths import cache_dir

METHODS = ("telea", "ns", "lama")
OUTPUT_FORMATS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff")
MASK_DILATE_PX = 3


_CACHED_LAMA_MODEL = None
_CACHED_LAMA_DEVICE = None


def lama_available() -> bool:
    from backend.core.deps import is_lama_ready

    return is_lama_ready()


def _get_direct_lama_model() -> tuple:
    global _CACHED_LAMA_MODEL, _CACHED_LAMA_DEVICE
    if _CACHED_LAMA_MODEL is not None:
        return _CACHED_LAMA_MODEL, _CACHED_LAMA_DEVICE

    from backend.core.deps import lama_model_path

    model_path = lama_model_path()
    if not model_path or not model_path.is_file():
        return None, None

    try:
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = torch.jit.load(str(model_path), map_location="cpu").to(device)
        model.eval()
        _CACHED_LAMA_MODEL = model
        _CACHED_LAMA_DEVICE = device
        return model, device
    except Exception:
        return None, None


def read_image(path: str) -> np.ndarray:
    """Unicode-safe read keeping the alpha channel."""
    if not Path(path).is_file():
        raise FileNotFoundError(path)
    data = np.fromfile(path, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot decode image: {path}")
    return img


def write_image(img: np.ndarray, path: str) -> str:
    ext = Path(path).suffix.lower()
    if ext not in OUTPUT_FORMATS:
        raise ValueError(f"Unsupported output format: {ext}")
    if ext in (".jpg", ".jpeg", ".bmp") and img.ndim == 3 and img.shape[2] == 4:
        img = img[:, :, :3]
    ok, buf = cv2.imencode(ext, img)
    if not ok:
        raise ValueError(f"Cannot encode image as {ext}")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    buf.tofile(path)
    return path


def decode_mask(mask_png: str, shape: tuple) -> np.ndarray:
    """Binary uint8 mask (0/255) sized like the image from a PNG data URL drawn in the UI."""
    data = np.frombuffer(thumbs.decode_data_url(mask_png), dtype=np.uint8)
    mask = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
    if mask is None:
        raise ValueError("Cannot decode mask")
    if mask.ndim == 3:
        # Painted strokes may be stored in the alpha channel (transparent canvas) or as colour.
        mask = mask[:, :, 3] if mask.shape[2] == 4 else cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
    if mask.shape[:2] != shape[:2]:
        mask = cv2.resize(mask, (shape[1], shape[0]), interpolation=cv2.INTER_NEAREST)
    _, binary = cv2.threshold(mask, 10, 255, cv2.THRESH_BINARY)
    # Painted masks tend to stop just short of the watermark; uncovered edge pixels would
    # otherwise be used as source colour and bleed into the filled area.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * MASK_DILATE_PX + 1, 2 * MASK_DILATE_PX + 1))
    return cv2.dilate(binary, kernel)


def _split_alpha(img: np.ndarray) -> tuple:
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), None
    if img.shape[2] == 4:
        return img[:, :, :3].copy(), img[:, :, 3]
    if img.shape[2] == 3:
        return img, None
    raise ValueError(f"Unsupported channel count: {img.shape[2]}")


def _inpaint_lama_direct(model: Any, device: str, bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
    import torch

    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    orig_h, orig_w = rgb.shape[:2]

    # Modulo-8 padding for LaMa FFC generator
    pad_h = (8 - orig_h % 8) % 8
    pad_w = (8 - orig_w % 8) % 8
    if pad_h > 0 or pad_w > 0:
        rgb_padded = cv2.copyMakeBorder(rgb, 0, pad_h, 0, pad_w, cv2.BORDER_REFLECT)
        mask_padded = cv2.copyMakeBorder(mask, 0, pad_h, 0, pad_w, cv2.BORDER_REFLECT)
    else:
        rgb_padded = rgb
        mask_padded = mask

    img_t = torch.from_numpy(rgb_padded).permute(2, 0, 1).unsqueeze(0).float() / 255.0
    mask_t = torch.from_numpy((mask_padded > 0).astype(np.float32)).unsqueeze(0).unsqueeze(0)

    with torch.no_grad():
        out_t = model(img_t.to(device), mask_t.to(device))

    res = out_t[0].permute(1, 2, 0).detach().cpu().numpy()
    res = res[:orig_h, :orig_w, :]
    res = np.clip(res * 255.0, 0, 255).astype(np.uint8)

    # Blend result: masked pixels are replaced with model inpainting, unmasked remain original
    binary_mask = (mask > 0)[:, :, np.newaxis]
    blended_rgb = np.where(binary_mask, res, rgb)
    return cv2.cvtColor(blended_rgb, cv2.COLOR_RGB2BGR)


def _inpaint_lama(bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
    model, device = _get_direct_lama_model()
    if model is not None:
        return _inpaint_lama_direct(model, device, bgr, mask)

    # Fallback to IOPaint if installed
    import torch
    from iopaint.model_manager import ModelManager
    from iopaint.schema import InpaintRequest

    device = "cuda" if torch.cuda.is_available() else "cpu"
    mm = ModelManager(name="lama", device=device)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    result = mm(rgb, mask, InpaintRequest())
    return cv2.cvtColor(np.clip(result, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)



def inpaint_array(img: np.ndarray, mask: np.ndarray, method: str) -> tuple:
    """Returns ``(result, notice)``; ``notice`` is an i18n key when LaMa fell back to Telea."""
    bgr, alpha = _split_alpha(img)
    if not np.any(mask):
        raise ValueError("Mask is empty")

    notice: Optional[str] = None
    if method == "lama":
        if lama_available():
            result = _inpaint_lama(bgr, mask)
        else:
            notice = "watermark.notice.lamaMissing"
            result = cv2.inpaint(bgr, mask, 3, cv2.INPAINT_TELEA)
    elif method == "ns":
        result = cv2.inpaint(bgr, mask, 3, cv2.INPAINT_NS)
    else:
        result = cv2.inpaint(bgr, mask, 3, cv2.INPAINT_TELEA)

    if alpha is not None:
        result = cv2.merge([result, alpha])
    return result, notice


def load_preview(path: str) -> Dict[str, Any]:
    """Full-resolution image as a data URL for the painting canvas."""
    img = read_image(path)
    bgr, alpha = _split_alpha(img)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    if alpha is not None:
        rgb = np.dstack([rgb, alpha])
    return {
        "path": path,
        "width": int(img.shape[1]),
        "height": int(img.shape[0]),
        "dataUrl": thumbs.to_data_url(rgb, max_size=None, fmt="PNG"),
    }


def remove(ctx: JobContext, image_path: str, mask_png: str, method: str = "telea") -> Dict[str, Any]:
    if method not in METHODS:
        raise ValueError(f"Unknown method: {method}")
    ctx.progress(None, "watermark.status.loading")
    img = read_image(image_path)
    mask = decode_mask(mask_png, img.shape)

    ctx.check_cancelled()
    ctx.progress(None, "watermark.status.processing", {"method": method})
    result, notice = inpaint_array(img, mask, method)

    # Keep the full-quality result on disk; the UI only receives a preview and a handle.
    result_path = cache_dir() / f"inpaint_{uuid.uuid4().hex[:10]}.png"
    write_image(result, str(result_path))

    bgr, alpha = _split_alpha(result)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    if alpha is not None:
        rgb = np.dstack([rgb, alpha])
    ctx.progress(100, "watermark.status.done")
    return {
        "resultPath": str(result_path),
        "dataUrl": thumbs.to_data_url(rgb, max_size=None, fmt="PNG"),
        "width": int(result.shape[1]),
        "height": int(result.shape[0]),
        "notice": notice,
    }


def save_result(result_path: str, out_path: str) -> str:
    """Re-encode a cached inpainting result to the user-chosen path/format."""
    return write_image(read_image(result_path), out_path)
