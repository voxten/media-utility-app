"""PDF page inspection, preview rendering and page-level merging (PyMuPDF)."""

import base64
from pathlib import Path
from typing import Any, Dict, List

import fitz  # PyMuPDF

from backend.core.jobs import JobContext

THUMB_ZOOM = 0.3
PREVIEW_ZOOM = 1.5


def _render(page: "fitz.Page", zoom: float) -> str:
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    data = pix.tobytes("jpeg", jpg_quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii")


def page_count(path: str) -> int:
    with fitz.open(path) as doc:
        return len(doc)


def inspect(ctx: JobContext, paths: List[str], zoom: float = THUMB_ZOOM) -> Dict[str, Any]:
    """Render a thumbnail for every page of every PDF.

    Pages are streamed through ``ctx.partial`` as they render so the grid fills in live;
    the final result also contains the full list and per-file errors.
    """
    docs = []
    errors = []
    for path in paths:
        try:
            docs.append((path, page_count(path)))
        except Exception as exc:  # noqa: BLE001 - report unreadable files individually
            errors.append({"file": path, "error": str(exc)})
            ctx.log("pdf.log.readFailed", "error", file=Path(path).name, error=str(exc))

    total = sum(count for _, count in docs) or 1
    done = 0
    pages: List[Dict[str, Any]] = []
    for path, count in docs:
        with fitz.open(path) as doc:
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
                pages.append(item)
                ctx.partial(item)
                done += 1
                ctx.progress(done / total * 100, "pdf.status.rendering", {"file": item["fileName"], "page": index + 1})
    return {"pages": pages, "errors": errors}


def render_page(path: str, page: int, zoom: float = PREVIEW_ZOOM) -> str:
    """Large single-page preview (synchronous; one page is fast enough)."""
    with fitz.open(path) as doc:
        return _render(doc[page], zoom)


def merge(ctx: JobContext, pages: List[Dict[str, Any]], out_path: str) -> Dict[str, Any]:
    """Write ``pages`` (``[{file, page}, ...]`` in the desired order) into a new PDF."""
    if not pages:
        raise ValueError("No pages to merge")

    sources: Dict[str, "fitz.Document"] = {}
    try:
        with fitz.open() as output:
            for idx, item in enumerate(pages):
                ctx.check_cancelled()
                path = item["file"]
                if path not in sources:
                    sources[path] = fitz.open(path)
                rot = item.get("rotation", -1)
                if rot is not None and rot >= 0:
                    output.insert_pdf(sources[path], from_page=item["page"], to_page=item["page"], rotate=rot % 360)
                else:
                    output.insert_pdf(sources[path], from_page=item["page"], to_page=item["page"])
                ctx.progress((idx + 1) / len(pages) * 95, "pdf.status.merging", {"current": idx + 1, "total": len(pages)})
            ctx.progress(97, "pdf.status.saving")
            Path(out_path).parent.mkdir(parents=True, exist_ok=True)
            output.save(out_path, garbage=3, deflate=True)
    finally:
        for doc in sources.values():
            doc.close()

    ctx.progress(100, "pdf.status.done")
    return {"outPath": out_path, "pageCount": len(pages), "bytes": Path(out_path).stat().st_size}


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


def compress(ctx: JobContext, path: str, out_path: str, quality_preset: str = "balanced") -> Dict[str, Any]:
    """Compress a PDF file by downsampling embedded images and deflating streams."""
    src = Path(path)
    if not src.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    in_bytes = src.stat().st_size
    ctx.progress(10, "pdf.status.compressing")
    ctx.check_cancelled()

    presets = {
        "low": {"dpi_threshold": 200, "dpi_target": 200, "quality": 85},
        "balanced": {"dpi_threshold": 150, "dpi_target": 150, "quality": 75},
        "high": {"dpi_threshold": 100, "dpi_target": 100, "quality": 60},
    }
    cfg = presets.get(quality_preset, presets["balanced"])

    target = Path(out_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    with fitz.open(str(src)) as doc:
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
        doc.save(str(target), garbage=4, clean=True, deflate=True, deflate_images=True, deflate_fonts=True)

    out_bytes = target.stat().st_size
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
    }


def split(
    ctx: JobContext,
    path: str,
    out_dir: str,
    mode: str = "all",
    range_spec: str = "",
) -> Dict[str, Any]:
    """Split a PDF into individual pages or extract a specific page range."""
    src = Path(path)
    if not src.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    out_dir_path = Path(out_dir)
    out_dir_path.mkdir(parents=True, exist_ok=True)
    stem = src.stem

    created_files: List[str] = []
    with fitz.open(str(src)) as doc:
        total = len(doc)
        if total == 0:
            raise ValueError("PDF document has 0 pages")

        if mode == "range":
            pages_to_extract = parse_page_range(range_spec, total)
            if not pages_to_extract:
                raise ValueError(f"No valid pages specified in range: '{range_spec}'")

            out_file = out_dir_path / f"{stem}_wybrane.pdf"
            with fitz.open() as sub_doc:
                for idx, page_num in enumerate(pages_to_extract):
                    ctx.check_cancelled()
                    sub_doc.insert_pdf(doc, from_page=page_num, to_page=page_num)
                    ctx.progress((idx + 1) / len(pages_to_extract) * 90, "pdf.status.splitting")
                sub_doc.save(str(out_file), garbage=3, deflate=True)
            created_files.append(str(out_file))
        else:
            for i in range(total):
                ctx.check_cancelled()
                out_file = out_dir_path / f"{stem}_strona_{i + 1:03d}.pdf"
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
) -> Dict[str, Any]:
    """Export every page of a PDF as an image file."""
    src = Path(path)
    if not src.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    out_dir_path = Path(out_dir)
    out_dir_path.mkdir(parents=True, exist_ok=True)
    fmt = fmt.lower()
    if fmt == "jpg":
        fmt = "jpeg"

    stem = src.stem
    created_files: List[str] = []
    with fitz.open(str(src)) as doc:
        total = len(doc)
        for i in range(total):
            ctx.check_cancelled()
            page = doc[i]
            pix = page.get_pixmap(dpi=dpi)
            ext = "jpg" if fmt == "jpeg" else fmt
            out_file = out_dir_path / f"{stem}_{i + 1:03d}.{ext}"
            if fmt == "webp":
                pix.pil_save(str(out_file), format="WEBP", quality=85)
            elif fmt in ("png", "jpeg"):
                pix.save(str(out_file))
            else:
                pix.pil_save(str(out_file))
            created_files.append(str(out_file))
            ctx.progress((i + 1) / total * 100, "pdf.status.rendering", {"file": out_file.name, "page": i + 1})

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

    target = Path(out_path)
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
    src = Path(path)
    if not src.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    target = Path(out_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    with fitz.open(str(src)) as doc:
        total = len(doc)
        pages_to_rotate = set(pages) if pages else set(range(total))
        for p in pages_to_rotate:
            if 0 <= p < total:
                doc[p].set_rotation((doc[p].rotation + angle) % 360)
        doc.save(str(target), garbage=3, deflate=True)

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
        raise FileNotFoundError(f"File not found: {path}")

    target = Path(out_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    lines: List[str] = []
    with fitz.open(str(src)) as doc:
        total = len(doc)
        for i in range(total):
            ctx.check_cancelled()
            lines.append(f"--- Strona {i + 1} ---")
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
