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


def _check_compressor(tmp: Path) -> Any:
    from PIL import Image

    from backend.services import compressor

    path = tmp / "comp.png"
    Image.new("RGB", (64, 64), (100, 150, 200)).save(path)
    res = compressor.load_preview(str(path))
    assert res["width"] == 64
    preview = compressor.preview_compress(str(path), {"mode": "lossless"})
    assert preview["compressedBytes"] > 0
    return True


def _check_image_editor(tmp: Path) -> Any:
    from PIL import Image

    from backend.services import image_editor

    path = tmp / "edit.png"
    Image.new("RGB", (80, 80), (200, 100, 50)).save(path)
    res = image_editor.load_preview(str(path))
    assert res["width"] == 80
    transformed = image_editor.preview_transform(str(path), {"rotate": 90})
    assert transformed["width"] == 80
    return True


def _check_system_info(_: Path) -> Any:
    from backend.services import system_info

    storage = system_info.get_storage_info()
    assert "cacheBytes" in storage
    hw = system_info.get_hardware_info()
    assert "cpuThreads" in hw
    return True


def _check_video_sync(tmp: Path) -> Any:
    import shutil
    import subprocess
    from backend.services import video_sync

    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        return "skipped (no ffmpeg)"

    test_video = tmp / "sync_smoke.mp4"
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=15",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        str(test_video),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    meta = video_sync.probe_media(str(test_video))
    assert meta["duration"] > 0
    wave = video_sync.extract_waveform(str(test_video), points=50)
    assert len(wave["points"]) == 50
    return {"duration": meta["duration"], "hasAudio": meta["hasAudio"]}


CHECKS: Dict[str, Callable[[Path], Any]] = {
    "streams": _check_streams,
    "frontend": _check_frontend,
    "icon": _check_icon,
    "mediainfo": _check_mediainfo,
    "converter": _check_converter,
    "pdf": _check_pdf,
    "duplicates": _check_duplicates,
    "watermark": _check_watermark,
    "compressor": _check_compressor,
    "image_editor": _check_image_editor,
    "system_info": _check_system_info,
    "video_sync": _check_video_sync,
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
