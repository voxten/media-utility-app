"""PDF page inspection, preview rendering and page-level merging (PyMuPDF)."""

import base64
import shutil
from pathlib import Path
from typing import Any, Dict, List, Sequence, Union

import fitz  # PyMuPDF

from backend.core.errors import AppError, MissingFile
from backend.core.ffmpeg import same_file
from backend.core.jobs import JobContext
from backend.core.paths import unique_path

THUMB_ZOOM = 0.3
PREVIEW_ZOOM = 1.5


def _render(page: "fitz.Page", zoom: float) -> str:
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    data = pix.tobytes("jpeg", jpg_quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii")


def _open(path: Union[str, Path]) -> fitz.Document:
    """An existing PDF opened for reading; a broken or password-protected one is refused with a readable reason."""
    name = Path(path).name
    try:
        doc = fitz.open(str(path))
    except fitz.FileNotFoundError as exc:
        raise MissingFile(path) from exc
    except (fitz.FileDataError, RuntimeError) as exc:
        raise AppError("errors.pdfUnreadable", file=name) from exc
    if doc.needs_pass:
        doc.close()
        raise AppError("errors.pdfEncrypted", file=name)
    return doc


def page_count(path: str) -> int:
    with _open(path) as doc:
        return len(doc)


def inspect(ctx: JobContext, paths: List[str], zoom: float = THUMB_ZOOM) -> Dict[str, Any]:
    """Render a thumbnail for every page of every PDF.

    Pages are streamed through ``ctx.partial`` as they render so the grid fills in live; the job
    keeps them, so the final result only counts them (sending every thumbnail twice doubled the
    memory a 300-page PDF took) and lists per-file errors.
    """
    docs = []
    errors = []
    for path in paths:
        try:
            docs.append((path, page_count(path)))
        except Exception as exc:  # noqa: BLE001 - report unreadable files individually
            errors.append({"file": path, "error": str(exc)})
            if isinstance(exc, AppError):
                ctx.log(exc.key, "error", **exc.params)
            else:
                ctx.log("pdf.log.readFailed", "error", file=Path(path).name, error=str(exc))

    total = sum(count for _, count in docs) or 1
    done = 0
    for path, count in docs:
        with _open(path) as doc:
            for index in range(count):
                ctx.check_cancelled()
                page = doc[index]
                item = {
                    "file": path,
                    "fileName": Path(path).name,
                    "page": index,
                    "width": page.rect.width,
                    "height": page.rect.height,
                    "thumb": _render(page, zoom),
                }
                ctx.partial(item)
                done += 1
                ctx.progress(done / total * 100, "pdf.status.rendering", {"file": item["fileName"], "page": index + 1})
    return {"pageCount": done, "errors": errors}


def render_page(path: str, page: int, zoom: float = PREVIEW_ZOOM) -> str:
    """Large single-page preview (synchronous; one page is fast enough)."""
    with _open(path) as doc:
        return _render(doc[page], zoom)


def merge(ctx: JobContext, pages: List[Dict[str, Any]], out_path: str) -> Dict[str, Any]:
    """Write ``pages`` (``[{file, page}, ...]`` in the desired order) into a new PDF."""
    if not pages:
        raise AppError("errors.noPages")

    sources: Dict[str, "fitz.Document"] = {}
    try:
        with fitz.open() as output:
            for idx, item in enumerate(pages):
                ctx.check_cancelled()
                path = item["file"]
                if path not in sources:
                    sources[path] = _open(path)
                rot = item.get("rotation", -1)
                if rot is not None and rot >= 0:
                    output.insert_pdf(sources[path], from_page=item["page"], to_page=item["page"], rotate=rot % 360)
                else:
                    output.insert_pdf(sources[path], from_page=item["page"], to_page=item["page"])
                ctx.progress((idx + 1) / len(pages) * 95, "pdf.status.merging", {"current": idx + 1, "total": len(pages)})
            ctx.progress(97, "pdf.status.saving")
            target = unique_path(Path(out_path))
            target.parent.mkdir(parents=True, exist_ok=True)
            output.save(str(target), garbage=3, deflate=True)
    finally:
        for doc in sources.values():
            doc.close()

    ctx.progress(100, "pdf.status.done")
    return {"outPath": str(target), "pageCount": len(pages), "bytes": target.stat().st_size}


def parse_page_range(spec: str, max_pages: int) -> List[int]:
    """Parse a range string like '1-3, 5, 8-10' into 0-indexed page numbers."""
    pages = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            try:
                start_s, end_s = part.split("-", 1)
                start = max(1, int(start_s.strip()))
                end = min(max_pages, int(end_s.strip()))
                for p in range(start, end + 1):
                    idx = p - 1
                    if 0 <= idx < max_pages and idx not in pages:
                        pages.append(idx)
            except ValueError:
                continue
        else:
            try:
                p = int(part)
                idx = p - 1
                if 0 <= idx < max_pages and idx not in pages:
                    pages.append(idx)
            except ValueError:
                continue
    return pages


def _write_path(src: Path, target: Path) -> Path:
    """Where to save ``target``: PyMuPDF cannot overwrite the open source, so that goes through a temp file."""
    return target.with_name(f"{target.stem}.tmp{target.suffix}") if same_file(src, target) else target


def _pages_label(pages: Sequence[int]) -> str:
    """1-based page list for a file name: [0, 1, 2, 4] → "1-3,5"."""
    parts: List[str] = []
    start = prev = pages[0]
    for page in [*pages[1:], None]:
        if page is not None and page == prev + 1:
            prev = page
            continue
        parts.append(f"{start + 1}" if start == prev else f"{start + 1}-{prev + 1}")
        if page is not None:
            start = prev = page
    return ",".join(parts)


def compress(ctx: JobContext, path: str, out_path: str, quality_preset: str = "balanced") -> Dict[str, Any]:
    """Compress a PDF file by downsampling embedded images and deflating streams."""
    src = Path(path)
    if not src.is_file():
        raise MissingFile(path)

    in_bytes = src.stat().st_size
    ctx.progress(10, "pdf.status.compressing")
    ctx.check_cancelled()

    # PyMuPDF needs the threshold above the target (equal values made every rewrite fail); images
    # up to 1.5x the target are left alone, as Ghostscript does.
    presets = {
        "low": {"dpi_threshold": 300, "dpi_target": 200, "quality": 85},
        "balanced": {"dpi_threshold": 225, "dpi_target": 150, "quality": 75},
        "high": {"dpi_threshold": 150, "dpi_target": 100, "quality": 60},
    }
    cfg = presets.get(quality_preset, presets["balanced"])

    target = unique_path(Path(out_path))
    target.parent.mkdir(parents=True, exist_ok=True)

    with _open(src) as doc:
        ctx.check_cancelled()
        ctx.progress(30, "pdf.status.rewritingImages")
        try:
            doc.rewrite_images(
                dpi_threshold=cfg["dpi_threshold"],
                dpi_target=cfg["dpi_target"],
                quality=cfg["quality"],
            )
        except Exception as exc:  # noqa: BLE001
            ctx.log("pdf.log.rewriteWarning", "warning", error=str(exc))

        ctx.check_cancelled()
        ctx.progress(70, "pdf.status.saving")
        write_path = _write_path(src, target)
        doc.save(str(write_path), garbage=4, clean=True, deflate=True, deflate_images=True, deflate_fonts=True)
    if write_path != target:
        write_path.replace(target)

    out_bytes = target.stat().st_size
    # Rewriting can grow a PDF (e.g. scans already stored as compact JBIG2); then the original is kept.
    no_gain = out_bytes >= in_bytes
    if no_gain:
        shutil.copyfile(src, target)
        out_bytes = in_bytes
        ctx.log("pdf.log.noGain", "warning")
    saved_bytes = max(0, in_bytes - out_bytes)
    saved_pct = round((saved_bytes / in_bytes * 100), 1) if in_bytes > 0 else 0.0

    ctx.progress(100, "pdf.status.done")
    return {
        "inPath": str(src),
        "outPath": str(target),
        "inBytes": in_bytes,
        "outBytes": out_bytes,
        "savedBytes": saved_bytes,
        "savedPercent": saved_pct,
        "noGain": no_gain,
    }


def split(
    ctx: JobContext,
    path: str,
    out_dir: str,
    mode: str = "all",
    groups: Sequence[Sequence[int]] = (),
) -> Dict[str, Any]:
    """Split a PDF into one file per page, or with mode 'groups' one file per group of 0-based page indexes."""
    src = Path(path)
    if not src.is_file():
        raise MissingFile(path)

    if mode not in ("all", "groups"):
        raise ValueError(f"Unknown split mode: '{mode}'")

    out_dir_path = Path(out_dir)
    out_dir_path.mkdir(parents=True, exist_ok=True)
    stem = src.stem

    created_files: List[str] = []
    with _open(src) as doc:
        total = len(doc)
        if total == 0:
            raise AppError("errors.pdfEmpty")

        if mode == "groups":
            valid = [sorted({int(p) for p in g if 0 <= int(p) < total}) for g in groups]
            valid = [g for g in valid if g]
            if not valid:
                raise AppError("errors.noPagesSelected")

            for idx, group in enumerate(valid):
                ctx.check_cancelled()
                out_file = unique_path(out_dir_path / f"{stem}_{_pages_label(group)}.pdf")
                with fitz.open() as sub_doc:
                    for page_num in group:
                        sub_doc.insert_pdf(doc, from_page=page_num, to_page=page_num)
                    sub_doc.save(str(out_file), garbage=3, deflate=True)
                created_files.append(str(out_file))
                ctx.progress((idx + 1) / len(valid) * 100, "pdf.status.splitting")
        else:
            for i in range(total):
                ctx.check_cancelled()
                out_file = unique_path(out_dir_path / f"{stem}_{i + 1:03d}.pdf")
                with fitz.open() as sub_doc:
                    sub_doc.insert_pdf(doc, from_page=i, to_page=i)
                    sub_doc.save(str(out_file), garbage=3, deflate=True)
                created_files.append(str(out_file))
                ctx.progress((i + 1) / total * 100, "pdf.status.splitting")

    ctx.progress(100, "pdf.status.done")
    return {
        "files": created_files,
        "count": len(created_files),
        "outDir": str(out_dir_path),
    }


def pdf_to_images(
    ctx: JobContext,
    path: str,
    out_dir: str,
    fmt: str = "png",
    dpi: int = 150,
    range_spec: str = "",
) -> Dict[str, Any]:
    """Export the pages of a PDF as image files: all of them, or those in ``range_spec`` (e.g. '1-3, 5')."""
    src = Path(path)
    if not src.is_file():
        raise MissingFile(path)

    out_dir_path = Path(out_dir)
    out_dir_path.mkdir(parents=True, exist_ok=True)
    fmt = fmt.lower()
    if fmt == "jpg":
        fmt = "jpeg"

    stem = src.stem
    created_files: List[str] = []
    with _open(src) as doc:
        pages = parse_page_range(range_spec, len(doc)) if range_spec.strip() else list(range(len(doc)))
        if not pages:
            raise AppError("errors.pageRangeInvalid", range=range_spec)
        total = len(pages)
        for done, i in enumerate(pages, start=1):
            ctx.check_cancelled()
            page = doc[i]
            pix = page.get_pixmap(dpi=dpi)
            ext = "jpg" if fmt == "jpeg" else fmt
            out_file = unique_path(out_dir_path / f"{stem}_{i + 1:03d}.{ext}")
            if fmt == "webp":
                pix.pil_save(str(out_file), format="WEBP", quality=85)
            elif fmt in ("png", "jpeg"):
                pix.save(str(out_file))
            else:
                pix.pil_save(str(out_file))
            created_files.append(str(out_file))
            ctx.progress(done / total * 100, "pdf.status.rendering", {"file": out_file.name, "page": i + 1})

    ctx.progress(100, "pdf.status.done")
    return {
        "files": created_files,
        "count": len(created_files),
        "outDir": str(out_dir_path),
    }


def images_to_pdf(ctx: JobContext, image_paths: List[str], out_path: str) -> Dict[str, Any]:
    """Assemble a list of images into a single multi-page PDF."""
    if not image_paths:
        raise ValueError("No images provided")

    target = unique_path(Path(out_path))
    target.parent.mkdir(parents=True, exist_ok=True)

    with fitz.open() as doc:
        total = len(image_paths)
        for idx, img_path in enumerate(image_paths):
            ctx.check_cancelled()
            src = Path(img_path)
            if not src.is_file():
                continue
            with fitz.open(str(src)) as img_doc:
                pdf_bytes = img_doc.convert_to_pdf()
            with fitz.open("pdf", pdf_bytes) as img_pdf:
                doc.insert_pdf(img_pdf)
            ctx.progress((idx + 1) / total * 90, "pdf.status.convertingImages")

        ctx.progress(95, "pdf.status.saving")
        doc.save(str(target), garbage=3, deflate=True)
        page_count = len(doc)

    ctx.progress(100, "pdf.status.done")
    return {
        "outPath": str(target),
        "pageCount": page_count,
        "bytes": target.stat().st_size,
    }


def rotate_pages(ctx: JobContext, path: str, pages: List[int], angle: int, out_path: str) -> Dict[str, Any]:
    """Rotate specified pages (0-indexed) by angle (e.g. 90, 180, 270) and save to out_path."""
    if angle % 90:
        raise ValueError(f"Rotation must be a multiple of 90 degrees, got {angle}")
    src = Path(path)
    if not src.is_file():
        raise MissingFile(path)

    target = Path(out_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    with _open(src) as doc:
        total = len(doc)
        requested = set(pages) if pages else set(range(total))
        pages_to_rotate = {p for p in requested if 0 <= p < total}
        for p in pages_to_rotate:
            doc[p].set_rotation((doc[p].rotation + angle) % 360)
        write_path = _write_path(src, target)
        doc.save(str(write_path), garbage=3, deflate=True)
    if write_path != target:
        write_path.replace(target)

    ctx.progress(100, "pdf.status.done")
    return {
        "outPath": str(target),
        "rotatedCount": len(pages_to_rotate),
        "bytes": target.stat().st_size,
    }


def extract_text(ctx: JobContext, path: str, out_path: str) -> Dict[str, Any]:
    """Extract plain text from all pages of a PDF document to a text file."""
    src = Path(path)
    if not src.is_file():
        raise MissingFile(path)

    target = unique_path(Path(out_path))
    target.parent.mkdir(parents=True, exist_ok=True)

    lines: List[str] = []
    with _open(src) as doc:
        total = len(doc)
        for i in range(total):
            ctx.check_cancelled()
            lines.append(f"--- {i + 1} ---")
            lines.append(doc[i].get_text("text"))
            lines.append("")
            ctx.progress((i + 1) / total * 90, "pdf.status.extractingText")

    target.write_text("\n".join(lines), encoding="utf-8")
    ctx.progress(100, "pdf.status.done")
    return {
        "outPath": str(target),
        "charCount": sum(len(line) for line in lines),
        "bytes": target.stat().st_size,
    }
