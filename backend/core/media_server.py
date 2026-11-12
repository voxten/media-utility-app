"""Local files for ``<img>``, ``<audio>`` and ``<video>`` in the window.

Sending a 24 MP result through the bridge meant 50-70 MB of base64 text that both Python and the
WebView had to hold. Instead, the bridge returns a URL on this small server: it listens on 127.0.0.1
only, every URL carries a random token, and it serves only files the app registered.
"""

import logging
import mimetypes
import re
import secrets
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import TYPE_CHECKING, Dict, Optional, Tuple, Union
from urllib.parse import quote, urlsplit

if TYPE_CHECKING:
    import numpy as np

logger = logging.getLogger(__name__)

CHUNK = 256 * 1024
# Formats the WebView shows as they are; anything else (TIFF, 16-bit…) is converted by the caller.
BROWSER_IMAGES = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")
_RANGE = re.compile(r"bytes=(\d*)-(\d*)$")

_lock = threading.Lock()
_files: Dict[str, Path] = {}
_keys: Dict[Path, str] = {}
_slots: Dict[str, Path] = {}
_server: Optional[ThreadingHTTPServer] = None
_token = secrets.token_urlsafe(16)

PathLike = Union[str, Path]


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - http.server naming
        self._send(body=True)

    def do_HEAD(self) -> None:  # noqa: N802
        self._send(body=False)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - silence per-request logging
        pass

    def _send(self, body: bool) -> None:
        parts = urlsplit(self.path).path.split("/")
        with _lock:
            path = _files.get(parts[2]) if len(parts) >= 3 and secrets.compare_digest(parts[1], _token) else None
        if path is None or not path.is_file():
            self.send_error(404)
            return
        size = path.stat().st_size
        span = _range(self.headers.get("Range"), size)
        if span is None:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return
        start, end = span
        partial = (start, end) != (0, size - 1) and "Range" in self.headers
        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(max(0, end - start + 1)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if not body:
            return
        try:
            with open(path, "rb") as f:
                f.seek(start)
                left = end - start + 1
                while left > 0:
                    chunk = f.read(min(CHUNK, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (ConnectionError, OSError):
            pass  # the player stopped reading, e.g. after a seek


def _range(header: Optional[str], size: int) -> Optional[Tuple[int, int]]:
    """``(first, last)`` byte of a ``Range: bytes=…`` request, the whole file without one."""
    if not header:
        return 0, size - 1
    match = _RANGE.match(header.strip())
    if not match or size == 0:
        return None
    first, last = match.groups()
    if first == "":
        if not last:
            return None
        return max(0, size - int(last)), size - 1
    start = int(first)
    end = min(int(last), size - 1) if last else size - 1
    return (start, end) if start <= end else None


def _port() -> int:
    global _server
    with _lock:
        if _server is None:
            _server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
            _server.daemon_threads = True
            threading.Thread(target=_server.serve_forever, name="media-server", daemon=True).start()
            logger.info("Media server listening on port %d", _server.server_address[1])
        return int(_server.server_address[1])


def file_url(path: PathLike) -> str:
    """A URL the window can load ``path`` from; the same file always gets the same address."""
    resolved = Path(path).resolve()
    port = _port()
    with _lock:
        key = _keys.get(resolved)
        if key is None:
            key = uuid.uuid4().hex
            _keys[resolved] = key
            _files[key] = resolved
        version = int(resolved.stat().st_mtime_ns) if resolved.exists() else 0
    return f"http://127.0.0.1:{port}/{_token}/{key}/{quote(resolved.name)}?v={version}"


def slot_url(slot: str, path: PathLike) -> str:
    """``file_url`` for a temporary preview; the previous file of the same ``slot`` is deleted."""
    new = Path(path).resolve()
    with _lock:
        old = _slots.get(slot)
        _slots[slot] = new
        if old is not None and old != new:
            key = _keys.pop(old, None)
            if key:
                _files.pop(key, None)
    if old is not None and old != new:
        old.unlink(missing_ok=True)
    return file_url(new)


def image_url(path: PathLike, rgb: "np.ndarray", slot: str) -> str:
    """URL of a photo as the window should show it: the file itself when the WebView can display it,
    otherwise ``rgb`` (RGB or RGBA, already read and turned upright) saved as a PNG preview."""
    source = Path(path)
    if source.suffix.lower() in BROWSER_IMAGES:
        return file_url(source)
    from PIL import Image

    from backend.core.paths import cache_dir

    preview = cache_dir() / f"preview_{uuid.uuid4().hex[:10]}.png"
    Image.fromarray(rgb).save(preview, "PNG", compress_level=1)
    return slot_url(slot, preview)


def shutdown() -> None:
    global _server
    with _lock:
        server, _server = _server, None
    if server is not None:
        server.shutdown()
        server.server_close()
