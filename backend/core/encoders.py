"""Which hardware video encoders really work with the current FFmpeg.

An encoder listed by ``ffmpeg -encoders`` may still fail (no card, old driver), so each one is
tried on a single frame. The answer is kept in memory and in ``cache_dir()``, keyed by the FFmpeg
binary (path, size, time), and dropped when an encode on the card fails.
"""

import json
import logging
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.core.ffmpeg import resolve_binary, run_capture
from backend.core.paths import cache_dir

logger = logging.getLogger(__name__)

VENDORS = ("nvenc", "qsv", "amf")
CODECS = ("h264", "hevc", "av1")
CACHE_FILE = "video_encoders.json"
PROBE_TIMEOUT_S = 20

_lock = threading.Lock()
_memory: Optional[Dict[str, Any]] = None


def pixel_format(encoder: str) -> str:
    return "nv12" if encoder.endswith(("_qsv", "_amf")) else "yuv420p"


def _fingerprint(ffmpeg: str) -> List[Any]:
    stat = Path(ffmpeg).stat()
    return [str(Path(ffmpeg).resolve()), stat.st_size, stat.st_mtime_ns]


def _compiled(ffmpeg: str) -> Tuple[str, List[str]]:
    """FFmpeg's version line and the hardware encoders it was built with."""
    version = run_capture([ffmpeg, "-hide_banner", "-version"], timeout=PROBE_TIMEOUT_S)
    listing = run_capture([ffmpeg, "-hide_banner", "-encoders"], timeout=PROBE_TIMEOUT_S)
    first_line = version.stdout.decode("utf-8", errors="replace").splitlines()[:1]
    names = {line.split()[1] for line in listing.stdout.decode("utf-8", errors="replace").splitlines() if len(line.split()) > 1}
    wanted = [f"{codec}_{vendor}" for vendor in VENDORS for codec in CODECS]
    return (first_line[0] if first_line else ""), [name for name in wanted if name in names]


def probe_encoder(ffmpeg: str, encoder: str) -> bool:
    """Whether ``encoder`` turns one generated frame into video."""
    cmd = [
        ffmpeg, "-hide_banner", "-v", "error",
        "-f", "lavfi", "-i", "color=c=black:s=256x256:r=25",
        "-frames:v", "1", "-pix_fmt", pixel_format(encoder), "-c:v", encoder,
        "-f", "null", "-",
    ]
    try:
        return run_capture(cmd, timeout=PROBE_TIMEOUT_S).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def _probe_vendor(ffmpeg: str, vendor: str, compiled: List[str]) -> List[str]:
    """A vendor's working encoders; the rest are skipped when its H.264 encoder fails."""
    names = [f"{codec}_{vendor}" for codec in CODECS if f"{codec}_{vendor}" in compiled]
    if not names or not probe_encoder(ffmpeg, names[0]):
        return []
    return [names[0]] + [name for name in names[1:] if probe_encoder(ffmpeg, name)]


def _read_cache(fingerprint: List[Any]) -> Optional[Dict[str, Any]]:
    try:
        data = json.loads((cache_dir() / CACHE_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("fingerprint") != fingerprint or not isinstance(data.get("encoders"), list):
        return None
    return data


def _write_cache(data: Dict[str, Any]) -> None:
    try:
        (cache_dir() / CACHE_FILE).write_text(json.dumps(data), encoding="utf-8")
    except OSError as exc:
        logger.warning("Could not save the video encoder list: %s", exc)


def detect(refresh: bool = False) -> Dict[str, Any]:
    """``{"version", "encoders"}``: the FFmpeg version line and working hardware encoders, best first."""
    global _memory
    ffmpeg = resolve_binary("ffmpeg")
    fingerprint = _fingerprint(ffmpeg)
    with _lock:
        if not refresh and _memory is not None and _memory.get("fingerprint") == fingerprint:
            return _memory
        cached = None if refresh else _read_cache(fingerprint)
        if cached is None:
            version, compiled = _compiled(ffmpeg)
            with ThreadPoolExecutor(max_workers=len(VENDORS)) as pool:
                found = list(pool.map(lambda vendor: _probe_vendor(ffmpeg, vendor, compiled), VENDORS))
            cached = {"fingerprint": fingerprint, "version": version, "encoders": [n for names in found for n in names]}
            logger.info("Hardware video encoders: %s", ", ".join(cached["encoders"]) or "none")
            _write_cache(cached)
        _memory = cached
        return cached


def invalidate() -> None:
    """Forget the encoder list, so the next encode tries the card again from scratch."""
    global _memory
    with _lock:
        _memory = None
        (cache_dir() / CACHE_FILE).unlink(missing_ok=True)


def hardware_encoder(codec: str) -> Optional[str]:
    """The first working hardware encoder for ``codec`` (NVENC, then QSV, then AMF), or None."""
    try:
        working = detect()["encoders"]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Hardware encoder check failed: %s", exc)
        return None
    return next((f"{codec}_{vendor}" for vendor in VENDORS if f"{codec}_{vendor}" in working), None)


def summary() -> Dict[str, Any]:
    """For the window: ``{"version", "devices": [{"id": "nvenc", "codecs": ["h264", …]}]}``."""
    data = detect()
    devices = []
    for vendor in VENDORS:
        codecs = [codec for codec in CODECS if f"{codec}_{vendor}" in data["encoders"]]
        if codecs:
            devices.append({"id": vendor, "codecs": codecs})
    return {"version": data.get("version", ""), "devices": devices}
