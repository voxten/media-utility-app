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
