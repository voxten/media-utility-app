"""Image helpers shared by the tools: Pillow formats (converter, compressor, image editor) and OpenCV channels."""

from contextlib import contextmanager
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, Iterator, Optional, Tuple, Union

from PIL import Image, ImageOps

if TYPE_CHECKING:
    import numpy as np

# Output formats that can keep transparency.
ALPHA_FORMATS = {"png", "webp", "gif", "tiff"}
# Output formats that store an ICC colour profile.
ICC_FORMATS = {"jpeg", "png", "webp", "tiff"}

# Pillow reports many camera JPEGs (Samsung, Sony, Fujifilm) as "MPO": a JPEG with extra frames.
_FORMAT_ALIASES = {"jpg": "jpeg", "tif": "tiff", "mpo": "jpeg"}


def normalize_format(fmt: str) -> str:
    """Lower-case Pillow format name for an extension or format choice ("JPG" → "jpeg", "tif" → "tiff", "MPO" → "jpeg")."""
    fmt = (fmt or "").lower().lstrip(".")
    return _FORMAT_ALIASES.get(fmt, fmt)


def pil_format(fmt: str) -> str:
    """Name Pillow's ``save`` expects ("jpg" → "JPEG")."""
    return normalize_format(fmt).upper()


def extension(fmt: str) -> str:
    """File extension for a format ("jpeg" → "jpg")."""
    fmt = normalize_format(fmt)
    return "jpg" if fmt == "jpeg" else fmt


def has_alpha(img: Image.Image) -> bool:
    return img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)


def color_profile(img: Image.Image, fmt: str) -> Dict[str, Any]:
    """``save`` arguments that keep the source's ICC profile, so wide-gamut photos (iPhone Display P3)
    do not come out washed out; empty when there is none or ``fmt`` cannot store one."""
    icc = img.info.get("icc_profile")
    return {"icc_profile": icc} if icc and normalize_format(fmt) in ICC_FORMATS else {}


def prepare_for_format(img: Image.Image, fmt: str) -> Image.Image:
    """Convert ``img`` to a mode ``fmt`` can store; transparency on a format without it goes onto white."""
    fmt = normalize_format(fmt)
    if has_alpha(img):
        rgba = img if img.mode == "RGBA" else img.convert("RGBA")
        if fmt in ALPHA_FORMATS:
            return rgba
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return img if img.mode == "RGB" else img.convert("RGB")


@contextmanager
def open_image(path: Union[str, Path]) -> Iterator[Image.Image]:
    """Open an image upright: the EXIF orientation of phone photos is applied, as browsers do."""
    with Image.open(path) as img:
        upright = ImageOps.exif_transpose(img)
        if upright is None:
            yield img
            return
        upright.format = img.format
        try:
            yield upright
        finally:
            if upright is not img:
                upright.close()


def _exif_orientation(path: Path) -> int:
    try:
        with Image.open(path) as img:
            return int(img.getexif().get(0x0112) or 1)
    except (OSError, ValueError, TypeError):
        return 1


def read_cv2(path: Union[str, Path]) -> "np.ndarray":
    """OpenCV image (BGR, BGRA or gray, 8-bit) for the AI tools, read like ``open_image``.

    ``IMREAD_UNCHANGED`` keeps alpha but skips the EXIF orientation, so phone photos are turned
    upright here; 16-bit PNG/TIFF and float images are scaled to 8 bits, which the models and the
    previews expect. The read is Unicode-safe (``cv2.imread`` is not on Windows).
    """
    import cv2
    import numpy as np

    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(str(p))
    img = cv2.imdecode(np.fromfile(str(p), dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("errors.imageUnreadable")
    if img.dtype == np.uint16:
        img = (img >> 8).astype(np.uint8)
    elif img.dtype != np.uint8:
        img = (np.clip(img, 0.0, 1.0) * 255).round().astype(np.uint8)
    orientation = _exif_orientation(p)
    if orientation == 2:
        img = cv2.flip(img, 1)
    elif orientation == 3:
        img = cv2.rotate(img, cv2.ROTATE_180)
    elif orientation == 4:
        img = cv2.flip(img, 0)
    elif orientation == 5:
        img = cv2.transpose(img)
    elif orientation == 6:
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    elif orientation == 7:
        img = cv2.flip(cv2.transpose(img), -1)
    elif orientation == 8:
        img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img


def split_alpha(img: "np.ndarray") -> Tuple["np.ndarray", Optional["np.ndarray"]]:
    """Split an OpenCV image into (BGR, alpha); alpha is None for images without one."""
    if img.ndim == 2:
        import cv2

        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), None
    if img.shape[2] == 4:
        return img[:, :, :3].copy(), img[:, :, 3].copy()
    if img.shape[2] == 3:
        return img, None
    raise ValueError(f"Unsupported channel count: {img.shape[2]}")
