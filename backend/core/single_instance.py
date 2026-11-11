"""One app instance per user: a second launch asks the running one to show its window.

With close-to-tray the app often keeps running hidden, so starting it again from the Start
menu must bring that window back instead of opening a second copy.
"""

import ctypes
import getpass
import sys
import threading
import time
from multiprocessing import AuthenticationError
from multiprocessing.connection import Client, Listener
from typing import Callable, Optional

AUTHKEY = b"media-studio-instance"
SHOW = b"show"


def _address(channel: str) -> str:
    try:
        user = getpass.getuser()
    except Exception:  # noqa: BLE001
        user = "user"
    safe = "".join(c for c in user if c.isalnum()) or "user"
    return rf"\\.\pipe\MediaStudio-{channel}-{safe}"


def notify_running(channel: str) -> bool:
    """Ask an already running instance to show itself; True when one answered."""
    if sys.platform == "win32":
        ASFW_ANY = -1  # this fresh launch owns the foreground; let the running window take it
        ctypes.windll.user32.AllowSetForegroundWindow(ASFW_ANY)
    try:
        with Client(_address(channel), family="AF_PIPE", authkey=AUTHKEY) as conn:
            conn.send_bytes(SHOW)
        return True
    except (OSError, EOFError, ValueError, AuthenticationError):
        return False


class InstanceListener:
    def __init__(self, channel: str) -> None:
        self._listener: Optional[Listener] = Listener(_address(channel), family="AF_PIPE", authkey=AUTHKEY)
        self._on_show: Callable[[], None] = lambda: None

    def serve(self, on_show: Callable[[], None]) -> None:
        self._on_show = on_show
        threading.Thread(target=self._loop, name="single-instance", daemon=True).start()

    def _loop(self) -> None:
        while self._listener is not None:
            try:
                with self._listener.accept() as conn:
                    if conn.recv_bytes(16) == SHOW:
                        self._on_show()
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


def listen(channel: str) -> Optional[InstanceListener]:
    """Start answering later launches; None when the pipe cannot be created (the app still runs)."""
    try:
        return InstanceListener(channel)
    except OSError:
        return None
