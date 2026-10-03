"""Image → data-URL helpers used for every preview sent to the UI."""

import base64
import io
from typing import Optional, Tuple, Union

import numpy as np
from PIL import Image

ImageLike = Union[Image.Image, np.ndarray, bytes]


def _to_pil(source: ImageLike) -> Image.Image:
    if isinstance(source, Image.Image):
        return source
    if isinstance(source, np.ndarray):
        # Arrays are expected in RGB / RGBA / grayscale order (convert BGR before calling).
        return Image.fromarray(source)
    if isinstance(source, (bytes, bytearray)):
        img = Image.open(io.BytesIO(source))
        img.load()
        return img
    raise TypeError(f"Unsupported image source: {type(source)!r}")


def to_data_url(
    source: ImageLike,
    max_size: Optional[Tuple[int, int]] = (320, 320),
    fmt: str = "JPEG",
    quality: int = 82,
) -> str:
    """Encode an image as a ``data:`` URL, shrinking it to fit ``max_size`` (aspect preserved)."""
    img = _to_pil(source)
    if max_size:
        img = img.copy()
        img.thumbnail(max_size, Image.Resampling.LANCZOS)

    fmt = fmt.upper()
    if fmt == "JPEG" and img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    buf = io.BytesIO()
    save_kwargs = {"quality": quality} if fmt in ("JPEG", "WEBP") else {}
    img.save(buf, fmt, **save_kwargs)
    mime = "jpeg" if fmt == "JPEG" else fmt.lower()
    return f"data:image/{mime};base64,{base64.b64encode(buf.getvalue()).decode('ascii')}"


def decode_data_url(data_url: str) -> bytes:
    """Return the raw bytes of a ``data:...;base64,`` URL (plain base64 is accepted too)."""
    payload = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
    return base64.b64decode(payload)
