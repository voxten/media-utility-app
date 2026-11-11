"""Pillow helpers shared by the image tools (converter, compressor, image editor)."""

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Union

from PIL import Image, ImageOps

# Output formats that can keep transparency.
ALPHA_FORMATS = {"png", "webp", "gif", "tiff"}

_FORMAT_ALIASES = {"jpg": "jpeg", "tif": "tiff"}


def normalize_format(fmt: str) -> str:
    """Lower-case Pillow format name for an extension or format choice ("JPG" → "jpeg", "tif" → "tiff")."""
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
