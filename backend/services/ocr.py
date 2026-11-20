"""Text from images and scans with the recognizer built into Windows (Windows.Media.Ocr, via pywinrt).

Images are recognized as they are shown (EXIF orientation applied) and scaled down to the engine's
size limit; word boxes come back in the coordinates of the image that was passed in. Scanned PDFs
can get an invisible text layer, so their text can be selected and searched.
"""

import asyncio
import logging
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, TypeVar

import fitz  # PyMuPDF
from PIL import Image, ImageGrab, UnidentifiedImageError

from backend.core.errors import AppError, MissingFile
from backend.core.imaging import open_image, prepare_for_format
from backend.core.jobs import JobContext
from backend.core.paths import cache_dir, unique_path
from backend.services.pdf import _open as open_pdf

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif")
PDF_DPI = 300
# OcrEngine.MaxImageDimension on current Windows; used when the engine cannot be asked.
DEFAULT_MAX_DIMENSION = 10000
# Embedded for the invisible text: the fonts built into PDF readers have no Polish letters.
TEXT_FONTS = (Path(r"C:\Windows\Fonts\arial.ttf"), Path(r"C:\Windows\Fonts\segoeui.ttf"))
TEXT_FONT_NAME = "OcrText"

T = TypeVar("T")


def _winrt() -> Dict[str, Any]:
    try:
        from winrt.windows.globalization import Language
        from winrt.windows.graphics.imaging import BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap
        from winrt.windows.media.ocr import OcrEngine
        from winrt.windows.storage.streams import DataWriter
    except (ImportError, OSError) as exc:
        logger.warning("Windows text recognition is not available: %s", exc)
        raise AppError("errors.ocrUnavailable") from exc
    return {
        "Language": Language,
        "BitmapAlphaMode": BitmapAlphaMode,
        "BitmapPixelFormat": BitmapPixelFormat,
        "SoftwareBitmap": SoftwareBitmap,
        "OcrEngine": OcrEngine,
        "DataWriter": DataWriter,
    }


def _in_fresh_thread(fn: Callable[[], T]) -> T:
    """Run ``fn`` on a new thread: WinRT calls and their event loop never share the job's thread."""
    box: Dict[str, Any] = {}

    def target() -> None:
        try:
            box["value"] = fn()
        except BaseException as exc:  # noqa: BLE001 - re-raised on the caller's thread
            box["error"] = exc

    thread = threading.Thread(target=target, name="ocr", daemon=True)
    thread.start()
    thread.join()
    if "error" in box:
        raise box["error"]
    return box["value"]


def _engine_call(fn: Callable[[Dict[str, Any]], T]) -> T:
    rt = _winrt()

    def run() -> T:
        try:
            return fn(rt)
        except AppError:
            raise
        except OSError as exc:
            logger.warning("Windows text recognition failed: %s", exc)
            raise AppError("errors.ocrUnavailable") from exc

    return _in_fresh_thread(run)


def languages() -> List[Dict[str, str]]:
    """Languages Windows can recognize on this computer: ``[{"tag": "pl", "name": "Polski"}]``."""
    return _engine_call(
        lambda rt: [
            {"tag": lang.language_tag, "name": lang.display_name}
            for lang in rt["OcrEngine"].available_recognizer_languages
        ]
    )


def max_dimension() -> int:
    try:
        return int(_engine_call(lambda rt: rt["OcrEngine"].max_image_dimension)) or DEFAULT_MAX_DIMENSION
    except AppError:
        return DEFAULT_MAX_DIMENSION


def _create_engine(rt: Dict[str, Any], language: str) -> Any:
    engine_cls = rt["OcrEngine"]
    if not list(engine_cls.available_recognizer_languages):
        raise AppError("errors.ocrNoLanguage")
    if language:
        try:
            lang = rt["Language"](language)
            supported = engine_cls.is_language_supported(lang)
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError("errors.ocrNoLanguage") from exc
        engine = engine_cls.try_create_from_language(lang) if supported else None
    else:
        engine = engine_cls.try_create_from_user_profile_languages()
        if engine is None:
            engine = engine_cls.try_create_from_language(engine_cls.available_recognizer_languages[0])
    if engine is None:
        raise AppError("errors.ocrNoLanguage")
    return engine


def _engine_recognize(img: Image.Image, language: str) -> Dict[str, Any]:
    """Raw engine result for an RGB image within the size limit: language tag, text angle and lines of words."""
    data = img.convert("RGBA").tobytes("raw", "BGRA")

    def run(rt: Dict[str, Any]) -> Dict[str, Any]:
        engine = _create_engine(rt, language)
        writer = rt["DataWriter"]()
        writer.write_bytes(data)
        bitmap = rt["SoftwareBitmap"].create_copy_from_buffer(
            writer.detach_buffer(),
            rt["BitmapPixelFormat"].BGRA8,
            img.width,
            img.height,
            rt["BitmapAlphaMode"].PREMULTIPLIED,
        )
        result = asyncio.run(_recognize_async(engine, bitmap))
        lines = []
        for line in result.lines:
            words = []
            for word in line.words:
                rect = word.bounding_rect
                words.append({"text": word.text, "x": rect.x, "y": rect.y, "w": rect.width, "h": rect.height})
            lines.append({"text": line.text, "words": words})
        return {"language": engine.recognizer_language.language_tag, "angle": result.text_angle, "lines": lines}

    return _engine_call(run)


async def _recognize_async(engine: Any, bitmap: Any) -> Any:
    return await engine.recognize_async(bitmap)


def recognize_image(img: Image.Image, language: str = "") -> Dict[str, Any]:
    """Text of an upright image: ``{"text", "language", "angle", "width", "height", "lines": [{"text", "words": [{"text", "x", "y", "w", "h"}]}]}``.

    The image is scaled down to the engine's limit first; boxes are given in ``img``'s own pixels.
    """
    rgb = prepare_for_format(img, "jpeg")
    limit = max_dimension()
    scale = min(1.0, limit / max(rgb.width, rgb.height))
    prepared = rgb
    if scale < 1.0:
        prepared = rgb.resize((max(1, int(rgb.width * scale)), max(1, int(rgb.height * scale))), Image.Resampling.LANCZOS)
    raw = _engine_recognize(prepared, language)
    factor = rgb.width / prepared.width
    lines = [
        {
            "text": line["text"],
            "words": [
                {
                    "text": w["text"],
                    "x": w["x"] * factor,
                    "y": w["y"] * factor,
                    "w": w["w"] * factor,
                    "h": w["h"] * factor,
                }
                for w in line["words"]
            ],
        }
        for line in raw["lines"]
    ]
    return {
        "text": "\n".join(line["text"] for line in lines),
        "language": raw["language"],
        "angle": raw.get("angle"),
        "width": rgb.width,
        "height": rgb.height,
        "lines": lines,
    }


def recognize_file(path: str, language: str = "") -> Dict[str, Any]:
    if not Path(path).is_file():
        raise MissingFile(path)
    try:
        with open_image(path) as img:
            return recognize_image(img, language)
    except (UnidentifiedImageError, OSError) as exc:
        if isinstance(exc, FileNotFoundError):
            raise MissingFile(path) from exc
        raise AppError("errors.imageUnreadable") from exc


def images(ctx: JobContext, params: Dict[str, Any]) -> Dict[str, Any]:
    """Job: text of one or more images, joined with an empty line between files."""
    t0 = time.monotonic()
    paths = [str(p) for p in params.get("paths") or []]
    language = str(params.get("language") or "")
    if not paths:
        raise ValueError("No images to recognize")
    texts: List[str] = []
    line_count = 0
    used = language
    for index, path in enumerate(paths):
        ctx.check_cancelled()
        ctx.progress(index / len(paths) * 100, "ocr.status.image", {"current": index + 1, "total": len(paths)}, force=True)
        result = recognize_file(path, language)
        used = result["language"]
        line_count += len(result["lines"])
        if result["text"]:
            texts.append(result["text"])
    ctx.progress(100, "ocr.status.done")
    text = "\n\n".join(texts)
    return {
        "text": text,
        "count": len(paths),
        "charCount": len(text),
        "lines": line_count,
        "language": used,
        "elapsed": round(time.monotonic() - t0, 1),
    }


def _text_font() -> Optional[Path]:
    return next((font for font in TEXT_FONTS if font.is_file()), None)


def _render_page(page: "fitz.Page", limit: int) -> "tuple[Image.Image, float]":
    rect = page.rect
    zoom = min(PDF_DPI / 72, limit / max(rect.width, rect.height, 1))
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csRGB, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples), zoom


def add_text_layer(page: "fitz.Page", lines: List[Dict[str, Any]], zoom: float, font_path: Optional[Path]) -> int:
    """Write recognized words onto ``page`` as invisible text over their place in the scan.

    ``lines`` hold boxes in pixels of the page rendered at ``zoom`` (as shown, rotation applied).
    Each line gets one font size from its height; each word is stretched to its box's width.
    """
    font = fitz.Font(fontfile=str(font_path)) if font_path else fitz.Font("helv")
    insert_args: Dict[str, Any] = {"fontname": TEXT_FONT_NAME, "fontfile": str(font_path)} if font_path else {"fontname": "helv"}
    ascender, descender = font.ascender, font.descender
    em = (ascender - descender) or 1.0
    rotation = page.rotation_matrix
    turn = fitz.Matrix(rotation.a, rotation.b, rotation.c, rotation.d, 0, 0)
    derotate = page.derotation_matrix
    shape = page.new_shape()
    written = 0
    for line in lines:
        words = [w for w in line["words"] if w["text"].strip() and w["w"] > 0 and w["h"] > 0]
        if not words:
            continue
        top = min(w["y"] for w in words) / zoom
        bottom = max(w["y"] + w["h"] for w in words) / zoom
        size = max((bottom - top) / em, 1.0)
        baseline = bottom + descender * size
        for word in words:
            length = font.text_length(word["text"], fontsize=size)
            if length <= 0:
                continue
            stretch = (word["w"] / zoom) / length
            point = fitz.Point(word["x"] / zoom, baseline) * derotate
            shape.insert_text(
                point,
                word["text"],
                fontsize=size,
                render_mode=3,
                morph=(point, fitz.Matrix(stretch, 1) * turn),
                **insert_args,
            )
            written += 1
    if written:
        shape.commit()
    return written


def pdf(ctx: JobContext, params: Dict[str, Any]) -> Dict[str, Any]:
    """Job: text of every page of a PDF; with ``outPath``, also a copy with an invisible text layer.

    Pages that already have text are read as they are and left unchanged.
    """
    t0 = time.monotonic()
    src = Path(str(params.get("path") or ""))
    language = str(params.get("language") or "")
    out_path = str(params.get("outPath") or "")
    if not src.is_file():
        raise MissingFile(src)
    limit = max_dimension()
    font_path = _text_font()
    texts: List[str] = []
    recognized = skipped = 0
    used = language
    target: Optional[Path] = None
    with open_pdf(src) as doc:
        total = len(doc)
        if total == 0:
            raise AppError("errors.pdfEmpty")
        for index in range(total):
            ctx.check_cancelled()
            ctx.progress(index / total * 100, "ocr.status.page", {"current": index + 1, "total": total}, force=True)
            page = doc[index]
            existing = page.get_text("text").strip()
            if existing:
                texts.append(existing)
                skipped += 1
                continue
            image, zoom = _render_page(page, limit)
            result = recognize_image(image, language)
            used = result["language"]
            recognized += 1
            if result["text"]:
                texts.append(result["text"])
            if out_path:
                add_text_layer(page, result["lines"], zoom, font_path)
        ctx.check_cancelled()
        if out_path and recognized:
            ctx.progress(99, "ocr.status.saving")
            target = unique_path(Path(out_path))
            target.parent.mkdir(parents=True, exist_ok=True)
            doc.subset_fonts()
            doc.save(str(target), garbage=3, deflate=True)
    ctx.progress(100, "ocr.status.done")
    text = "\n\n".join(texts)
    return {
        "text": text,
        "charCount": len(text),
        "pageCount": total,
        "recognized": recognized,
        "skipped": skipped,
        "language": used,
        "outPath": str(target) if target else None,
        "bytes": target.stat().st_size if target else None,
        "elapsed": round(time.monotonic() - t0, 1),
    }


def clipboard_image() -> List[str]:
    """Image files for what is on the clipboard: a copied picture saved as PNG, or copied image / PDF files."""
    try:
        data = ImageGrab.grabclipboard()
    except OSError as exc:
        logger.info("Could not read the clipboard: %s", exc)
        return []
    if isinstance(data, Image.Image):
        folder = cache_dir() / "ocr"
        folder.mkdir(parents=True, exist_ok=True)
        target = unique_path(folder / f"clipboard-{time.strftime('%Y%m%d-%H%M%S')}.png")
        data.save(target, "PNG")
        return [str(target)]
    if isinstance(data, list):
        return [str(p) for p in data if Path(p).suffix.lower() in (*IMAGE_EXTENSIONS, ".pdf") and Path(p).is_file()]
    return []


def save_text(text: str, out_path: str) -> str:
    target = Path(out_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(str(text), encoding="utf-8")
    return str(target)
