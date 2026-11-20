"""A shortcut that works in all of Windows, also while the window is hidden in the tray.

``RegisterHotKey`` ties the shortcut to the thread that registered it, and only that thread's
message queue receives ``WM_HOTKEY``. So the shortcut lives on its own thread: changes are posted
to it as ``WM_APP`` and the caller waits for the answer, which tells whether another program
already owns the combination.
"""

import ctypes
import logging
import sys
import threading
from ctypes import wintypes
from typing import Any, Callable, Dict, Optional, Tuple

from backend.core.errors import AppError

logger = logging.getLogger(__name__)

MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_NOREPEAT = 0x1, 0x2, 0x4, 0x4000
WM_USER, WM_APP, WM_HOTKEY, WM_QUIT = 0x0400, 0x8000, 0x0312, 0x0012
PM_NOREMOVE = 0
ERROR_HOTKEY_ALREADY_REGISTERED = 1409
REPLY_TIMEOUT_S = 2.0

# Ctrl+Alt is AltGr, so letters that give Polish diacritics with AltGr (A C E L N O S U X Z) are left out.
COMBOS: Dict[str, Tuple[int, int]] = {
    "ctrl+alt+d": (MOD_CONTROL | MOD_ALT, ord("D")),
    "ctrl+alt+shift+d": (MOD_CONTROL | MOD_ALT | MOD_SHIFT, ord("D")),
    "ctrl+alt+y": (MOD_CONTROL | MOD_ALT, ord("Y")),
    "ctrl+alt+shift+y": (MOD_CONTROL | MOD_ALT | MOD_SHIFT, ord("Y")),
}


class _User32:
    """The few user32 calls the hotkey thread needs; tests pass a fake with the same methods."""

    def __init__(self) -> None:
        dll = ctypes.WinDLL("user32", use_last_error=True)
        dll.PeekMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT, wintypes.UINT]
        dll.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]
        dll.GetMessageW.restype = wintypes.BOOL
        dll.PostThreadMessageW.argtypes = [wintypes.DWORD, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
        dll.RegisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT]
        dll.UnregisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int]
        self._dll = dll

    def create_queue(self) -> None:
        msg = wintypes.MSG()
        self._dll.PeekMessageW(ctypes.byref(msg), None, WM_USER, WM_USER, PM_NOREMOVE)

    def next_message(self) -> Optional[int]:
        """The next message id on this thread's queue; None once WM_QUIT arrives (or on failure)."""
        msg = wintypes.MSG()
        result = self._dll.GetMessageW(ctypes.byref(msg), None, 0, 0)
        return msg.message if result > 0 else None

    def post(self, thread_id: int, message: int) -> bool:
        return bool(self._dll.PostThreadMessageW(thread_id, message, 0, 0))

    def register(self, hotkey_id: int, modifiers: int, key: int) -> int:
        """0 on success, otherwise the Windows error code."""
        if self._dll.RegisterHotKey(None, hotkey_id, modifiers, key):
            return 0
        return ctypes.get_last_error() or -1

    def unregister(self, hotkey_id: int) -> None:
        self._dll.UnregisterHotKey(None, hotkey_id)


class GlobalHotkey:
    def __init__(self, callback: Callable[[], None], user32: Any = None) -> None:
        self._callback = callback
        self._user32 = user32
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._thread_id = 0
        self._started = threading.Event()
        self._request: Optional[str] = None
        self._reply = threading.Event()
        self._error = 0
        self._hotkey_id = 0  # registered id: 1 or 2, so a new combination is in place before the old one goes
        self.combo = ""

    def set(self, combo: str) -> None:
        """Use ``combo`` (a COMBOS key, "" for none); raises AppError when another program owns it."""
        if combo and combo not in COMBOS:
            raise ValueError(f"Unknown hotkey {combo}")
        with self._lock:
            if combo == self.combo:
                return
            if not self._ensure_thread():
                raise AppError("errors.hotkeyTaken")
            self._request, self._error = combo, 0
            self._reply.clear()
            answered = self._user32.post(self._thread_id, WM_APP) and self._reply.wait(REPLY_TIMEOUT_S)
            if not answered or self._error:
                logger.warning("Global hotkey %s not registered (error %s)", combo, self._error or "timeout")
                raise AppError("errors.hotkeyTaken")
            self.combo = combo

    def stop(self) -> None:
        with self._lock:
            thread = self._thread
            if thread is None or not thread.is_alive():
                return
            self._user32.post(self._thread_id, WM_QUIT)
            thread.join(REPLY_TIMEOUT_S)
            self._thread = None
            self.combo = ""

    def _ensure_thread(self) -> bool:
        if self._thread is not None and self._thread.is_alive():
            return True
        if self._user32 is None:
            if sys.platform != "win32":
                return False
            self._user32 = _User32()
        self._started.clear()
        self._thread = threading.Thread(target=self._run, name="global-hotkey", daemon=True)
        self._thread.start()
        return self._started.wait(REPLY_TIMEOUT_S)

    def _run(self) -> None:
        user32 = self._user32
        user32.create_queue()  # PostThreadMessage fails until the thread has a message queue
        self._thread_id = threading.get_native_id()
        self._started.set()
        try:
            while True:
                message = user32.next_message()
                if message is None:
                    break
                if message == WM_HOTKEY:
                    threading.Thread(target=self._fire, name="global-hotkey-action", daemon=True).start()
                elif message == WM_APP:
                    self._apply()
        finally:
            if self._hotkey_id:
                user32.unregister(self._hotkey_id)
                self._hotkey_id = 0

    def _apply(self) -> None:
        combo = self._request or ""
        new_id = 0
        if combo:
            new_id = 2 if self._hotkey_id == 1 else 1
            modifiers, key = COMBOS[combo]
            self._error = self._user32.register(new_id, modifiers | MOD_NOREPEAT, key)
            if self._error:
                self._reply.set()
                return
        if self._hotkey_id:
            self._user32.unregister(self._hotkey_id)
        self._hotkey_id = new_id
        self._reply.set()

    def _fire(self) -> None:
        try:
            self._callback()
        except Exception:  # noqa: BLE001 - a failing action must not end the shortcut
            logger.exception("Global hotkey action failed")
