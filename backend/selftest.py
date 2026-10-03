"""Smoke test of a (frozen) build: `MediaStudio.exe --selftest result.json`.

Checks that every native/optional dependency is importable from the bundle and runs each
offline service once on generated files. Network-only features (yt-dlp, edge-tts) are
import-checked only. Writes a JSON report and returns True when everything passed.
"""

import importlib
import json
import tempfile
import time
import traceback
from pathlib import Path
from typing import Any, Callable, Dict

from backend import APP_VERSION
from backend.core.jobs import JobContext
from backend.core.paths import resource_path

MODULES = [
    "webview",
    "clr",  # pythonnet, needed by pywebview's WinForms backend and Mica
    "cv2",
    "fitz",
    "numpy",
    "PIL",
    "imagehash",
    "pymediainfo",
    "yt_dlp",
    "requests",
    "edge_tts",
    "pyttsx3",
    "pydub",
    "send2trash",
]


def _check_converter(tmp: Path) -> Any:
    from PIL import Image

    from backend.services import converter

    src = tmp / "conv"
    src.mkdir()
    Image.new("RGBA", (32, 32), (255, 0, 0, 128)).save(src / "a.png")
    result = converter.convert(JobContext(), converter.ConvertOptions(input_dir=str(src), in_fmt="PNG", output_dir=str(tmp / "conv_out"), out_fmt="WEBP"))
    assert result["converted"] == 1, result
    return result["converted"]


def _check_pdf(tmp: Path) -> Any:
    import fitz

    from backend.services import pdf

    path = tmp / "a.pdf"
    doc = fitz.open()
    doc.new_page()
    doc.new_page()
    doc.save(str(path))
    doc.close()
    pages = pdf.inspect(JobContext(), [str(path)])["pages"]
    out = tmp / "merged.pdf"
    pdf.merge(JobContext(), [{"file": str(path), "page": 1}, {"file": str(path), "page": 0}], str(out))
    return {"pages": len(pages), "merged": out.exists()}


def _check_duplicates(tmp: Path) -> Any:
    import numpy as np
    from PIL import Image

    from backend.services import duplicates

    folder = tmp / "dups"
    folder.mkdir()
    img = Image.fromarray(np.random.default_rng(1).integers(0, 255, (64, 64, 3), dtype=np.uint8))
    img.save(folder / "a.png")
    img.save(folder / "b.png")
    result = duplicates.scan(JobContext(), str(folder), "image")
    assert len(result["groups"]) == 1, result
    return len(result["groups"])


def _check_watermark(tmp: Path) -> Any:
    import numpy as np

    from backend.core import thumbs
    from backend.services import watermark

    img = np.full((40, 40, 3), 120, np.uint8)
    path = tmp / "wm.png"
    watermark.write_image(img, str(path))
    mask = np.zeros((40, 40), np.uint8)
    mask[10:20, 10:20] = 255
    result = watermark.remove(JobContext(), str(path), thumbs.to_data_url(mask, None, "PNG"), "telea")
    return Path(result["resultPath"]).exists()


def _check_mediainfo(_: Path) -> Any:
    from pymediainfo import MediaInfo

    assert MediaInfo.can_parse(), "MediaInfo library not found"
    return True


def _check_streams(_: Path) -> Any:
    """Workers log errors with traceback.print_exc(); that must not raise in a windowed build."""
    import sys

    try:
        raise RuntimeError("selftest traceback")
    except RuntimeError:
        traceback.print_exc()
    print("selftest stdout", flush=True)
    sys.stderr.flush()
    return True


def _check_frontend(_: Path) -> Any:
    index = resource_path("frontend", "dist", "index.html")
    assert index.is_file(), f"missing {index}"
    return str(index)


def _check_icon(_: Path) -> Any:
    icon = resource_path("assets", "app.ico")
    assert icon.is_file(), f"missing {icon}"
    return True


CHECKS: Dict[str, Callable[[Path], Any]] = {
    "streams": _check_streams,
    "frontend": _check_frontend,
    "icon": _check_icon,
    "mediainfo": _check_mediainfo,
    "converter": _check_converter,
    "pdf": _check_pdf,
    "duplicates": _check_duplicates,
    "watermark": _check_watermark,
}


def run(out_path: str) -> bool:
    import sys

    report: Dict[str, Any] = {
        "version": APP_VERSION,
        "frozen": bool(getattr(sys, "frozen", False)),
        # A windowed build must still have writable streams (see main.ensure_output_streams).
        "streams": {"stdout": type(sys.stdout).__name__, "stderr": type(sys.stderr).__name__},
        "modules": {},
        "checks": {},
    }
    ok = True
    for name in MODULES:
        try:
            importlib.import_module(name)
            report["modules"][name] = "ok"
        except Exception as exc:  # noqa: BLE001
            report["modules"][name] = f"FAIL: {exc!r}"
            ok = False
    with tempfile.TemporaryDirectory() as tmp:
        for name, check in CHECKS.items():
            start = time.perf_counter()
            try:
                report["checks"][name] = {"ok": True, "value": check(Path(tmp)), "ms": round((time.perf_counter() - start) * 1000)}
            except Exception:  # noqa: BLE001
                report["checks"][name] = {"ok": False, "error": traceback.format_exc()}
                ok = False
    try:
        from backend.core.deps import check_dependencies

        report["dependencies"] = check_dependencies()
    except Exception:  # noqa: BLE001
        report["dependencies"] = traceback.format_exc()
    report["ok"] = ok
    Path(out_path).write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    return ok
