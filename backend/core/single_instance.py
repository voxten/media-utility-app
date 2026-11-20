"""One app instance per user: a second launch asks the running one to show its window.

With close-to-tray the app often keeps running hidden, so starting it again from the Start
menu must bring that window back instead of opening a second copy. Files passed to the second
launch (Open with, Send to, the Explorer menu) and a link from the browser bookmark travel along
and open in the running window.
"""

import ctypes
import getpass
import json
import sys
import threading
import time
from multiprocessing import AuthenticationError
from multiprocessing.connection import Client, Listener
from typing import Callable, List, NamedTuple, Optional, Sequence

AUTHKEY = b"media-studio-instance"
MAX_MESSAGE = 1 << 20
# Explorer starts one copy per selected file; paths arriving this close together open as one set.
BATCH_DELAY_S = 0.6


def _address(channel: str) -> str:
    try:
        user = getpass.getuser()
    except Exception:  # noqa: BLE001
        user = "user"
    safe = "".join(c for c in user if c.isalnum()) or "user"
    return rf"\\.\pipe\MediaStudio-{channel}-{safe}"


class Message(NamedTuple):
    paths: List[str]
    link: Optional[str]


def notify_running(channel: str, paths: Sequence[str] = (), link: Optional[str] = None) -> bool:
    """Ask an already running instance to show itself and open ``paths`` or ``link``; True when one answered."""
    if sys.platform == "win32":
        ASFW_ANY = -1  # this fresh launch owns the foreground; let the running window take it
        ctypes.windll.user32.AllowSetForegroundWindow(ASFW_ANY)
    try:
        with Client(_address(channel), family="AF_PIPE", authkey=AUTHKEY) as conn:
            conn.send_bytes(json.dumps({"paths": list(paths), "link": link}).encode("utf-8"))
        return True
    except (OSError, EOFError, ValueError, AuthenticationError):
        return False


class InstanceListener:
    def __init__(self, channel: str) -> None:
        self._listener: Optional[Listener] = Listener(_address(channel), family="AF_PIPE", authkey=AUTHKEY)
        self._on_message: Callable[[Message], None] = lambda message: None

    def serve(self, on_message: Callable[[Message], None]) -> None:
        """``on_message`` gets what a later launch passed (often nothing) on the listener thread."""
        self._on_message = on_message
        threading.Thread(target=self._loop, name="single-instance", daemon=True).start()

    def _loop(self) -> None:
        while self._listener is not None:
            try:
                with self._listener.accept() as conn:
                    self._on_message(parse_message(conn.recv_bytes(MAX_MESSAGE)))
            except (AuthenticationError, EOFError):
                continue  # a foreign or dropped client must not stop the listener
            except OSError:
                time.sleep(0.2)

    def close(self) -> None:
        listener, self._listener = self._listener, None
        if listener is not None:
            try:
                listener.close()
            except OSError:
                pass


def parse_message(message: bytes) -> Message:
    try:
        data = json.loads(message.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        data = None
    if not isinstance(data, dict):
        return Message([], None)
    paths, link = data.get("paths"), data.get("link")
    return Message(
        [p for p in paths if isinstance(p, str)] if isinstance(paths, list) else [],
        link if isinstance(link, str) else None,
    )


class PathBatcher:
    """Collects paths for ``delay`` seconds after the first one, then hands them over at once."""

    def __init__(self, deliver: Callable[[List[str]], None], delay: float = BATCH_DELAY_S) -> None:
        self._deliver = deliver
        self._delay = delay
        self._paths: List[str] = []
        self._lock = threading.Lock()
        self._timer: Optional[threading.Timer] = None

    def add(self, paths: Sequence[str]) -> None:
        if not paths:
            return
        with self._lock:
            self._paths.extend(p for p in paths if p not in self._paths)
            if self._timer is None:
                self._timer = threading.Timer(self._delay, self._flush)
                self._timer.daemon = True
                self._timer.start()

    def _flush(self) -> None:
        with self._lock:
            paths, self._paths, self._timer = self._paths, [], None
        if paths:
            self._deliver(paths)


def listen(channel: str) -> Optional[InstanceListener]:
    """Start answering later launches; None when the pipe cannot be created (the app still runs)."""
    try:
        return InstanceListener(channel)
    except OSError:
        return None
