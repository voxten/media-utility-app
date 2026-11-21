"""Running a finished job again from the bridge call that started it, saved in the history as JSON.

Only the calls listed in ``INPUTS`` can run again. Each entry names the local files the call reads,
which must still exist. Cookies are never part of a saved call: the bridge reads them from the
settings when the job starts.
"""

from pathlib import Path
from typing import Any, Callable, Dict, List

from backend.core.errors import AppError

Args = List[Any]


def _paths(value: Any) -> List[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [v for v in value if isinstance(v, str)]
    return []


def _first_arg(args: Args) -> List[str]:
    return _paths(args[0]) if args else []


def _params(*keys: str) -> Callable[[Args], List[str]]:
    """Paths under ``keys`` of the call's first argument, a dict."""

    def inputs(args: Args) -> List[str]:
        params = args[0] if args and isinstance(args[0], dict) else {}
        return [path for key in keys for path in _paths(params.get(key))]

    return inputs


def _merge_pages(args: Args) -> List[str]:
    pages = args[0] if args and isinstance(args[0], list) else []
    return list(dict.fromkeys(page["file"] for page in pages if isinstance(page, dict) and isinstance(page.get("file"), str)))


def _no_files(args: Args) -> List[str]:
    return []


INPUTS: Dict[str, Callable[[Args], List[str]]] = {
    "converter.start": _params("files", "inputDir"),
    "media_convert.start": _params("paths"),
    "image_editor.start_batch": _first_arg,
    "compressor.start": _params("files", "path"),
    "pdf.merge": _merge_pages,
    "pdf.compress": _first_arg,
    "pdf.split": _first_arg,
    "pdf.pdf_to_images": _first_arg,
    "pdf.images_to_pdf": _first_arg,
    "pdf.extract_text": _first_arg,
    "tts.synthesize": _no_files,
    "video_to_gif.start": _params("path"),
    "gif_editor.start": _params("files", "path"),
    "video_sync.start": _params("videoPath", "audioPath"),
    "transcribe.start": _params("path"),
    "upscale.start": _params("path"),
    "rembg.remove": _params("path"),
    "download.start": _no_files,
    "download.batch": _no_files,
    "instagram.start": _no_files,
    "ocr.images": _params("paths"),
    "ocr.pdf": _params("path"),
}


def call(method: str, *args: Any) -> Dict[str, Any]:
    """The saved form of a bridge call, passed to ``JobManager.submit(replay=...)``."""
    return {"method": method, "args": list(args)}


def rerun(api: Any, replay: Any) -> str:
    """Start the saved call again on ``api`` (the bridge root); the new job's id.

    A download queue starts as a new, independent one, so the unfinished queue the user saved stays as it is.
    """
    method = replay.get("method") if isinstance(replay, dict) else None
    args = replay.get("args") if isinstance(replay, dict) else None
    inputs = INPUTS.get(method) if isinstance(method, str) else None
    if inputs is None or not isinstance(args, list):
        raise AppError("errors.rerunUnsupported")
    for path in inputs(args):
        if not path or not Path(path).exists():
            raise AppError("errors.rerunMissing", file=Path(path).name or path)
    if method == "download.batch":
        if not args or not isinstance(args[0], dict):
            raise AppError("errors.rerunUnsupported")
        return api.download._rerun_batch(args[0])
    namespace, name = method.split(".", 1)
    return getattr(getattr(api, namespace), name)(*args)
