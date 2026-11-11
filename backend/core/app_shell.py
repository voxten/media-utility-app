"""Window lifecycle around the tray icon.

With ``closeToTray`` the X button only hides the window: jobs keep running and finish with
a system notification. The app really quits from the tray menu (or from X when the setting
is off), asking first while jobs are still running if ``confirmExitOnActiveJobs`` is on.
"""

import ctypes
import sys
import threading
from typing import Any, Callable, Dict, Optional

from backend.core import clipboard, win_theme
from backend.core.paths import resource_path
from backend.core.settings import Settings
from backend.core.tray import DEFAULT_LABELS as TRAY_LABELS
from backend.core.tray import Tray

DEFAULT_LABELS: Dict[str, str] = {
    **TRAY_LABELS,
    "backgroundTitle": "Running in the background",
    "backgroundBody": "Click the tray icon to bring the window back.",
    "quitConfirmTitle": "Quit",
    "quitConfirmBody": "Jobs are still running and will be stopped. Quit anyway?",
    "clipboardEmpty": "The clipboard has no YouTube, TikTok, X or Instagram link.",
}

MB_YESNO, MB_ICONWARNING, MB_DEFBUTTON2 = 0x04, 0x30, 0x100
MB_SETFOREGROUND, MB_TOPMOST = 0x10000, 0x40000
IDYES = 6
SM_SHUTTINGDOWN = 0x2000


def _user32() -> Any:
    if sys.platform != "win32":
        return None
    user32 = ctypes.windll.user32
    user32.GetForegroundWindow.restype = ctypes.c_void_p
    return user32


Emit = Callable[[str, Dict[str, Any]], None]


class AppShell:
    def __init__(
        self,
        title: str,
        settings: Settings,
        active_jobs: Callable[[], int],
        emit: Optional[Emit] = None,
    ) -> None:
        self._title = title
        self._settings = settings
        self._active_jobs = active_jobs
        self._emit = emit or (lambda event, payload: None)
        self._labels = dict(DEFAULT_LABELS)
        self._window: Any = None
        self._hwnd: Optional[int] = None
        self._quitting = False
        self.restart_requested = False
        self.tray = Tray(title, resource_path("assets", "app.ico"), self.show, self.quit, self.download_clipboard_link)

    def attach(self, window: Any) -> None:
        self._window = window
        try:
            from Microsoft.Win32 import SystemEvents  # pythonnet, available with the WinForms backend

            SystemEvents.SessionEnding += lambda _sender, _args: self._end_session()
        except Exception:  # noqa: BLE001 - SM_SHUTTINGDOWN below still covers it
            pass

    def start(self) -> None:
        self.tray.start()

    def stop(self) -> None:
        self.tray.stop()

    def set_labels(self, labels: Dict[str, str]) -> None:
        self._labels.update({k: str(v) for k, v in (labels or {}).items() if k in DEFAULT_LABELS and v})
        self.tray.set_labels(self._labels)

    def notify(self, title: str, body: str, force: bool = False) -> bool:
        """Show a system notification, skipped while the user is looking at the window."""
        if not force and self._window_active():
            return False
        return self.tray.notify(title, body)

    def on_closing(self) -> Optional[bool]:
        """``window.events.closing`` handler (UI thread); returning False keeps the window."""
        if self._quitting:
            return None
        if self._session_ending():
            self._quitting = True  # never hold up a Windows sign-out or shutdown
            return None
        if self._settings.get("closeToTray", True) and self.tray.running:
            threading.Thread(target=self._hide, name="hide-window", daemon=True).start()
            return False
        if not self._confirm_quit(self._handle()):
            return False
        self._quitting = True
        return None

    def show(self) -> None:
        window = self._window
        if window is None or self._quitting:
            return
        window.show()
        user32, hwnd = _user32(), self._handle()
        if user32 and hwnd and user32.IsIconic(ctypes.c_void_p(hwnd)):
            window.restore()
        if user32 and hwnd:
            user32.SetForegroundWindow(ctypes.c_void_p(hwnd))

    def download_clipboard_link(self) -> None:
        """Tray menu: open the copied link in the matching download tool (``clipboard:link``)."""
        link = clipboard.find_link(clipboard.read_text())
        if link is None:
            self.tray.notify(self._title, self._labels["clipboardEmpty"])
            return
        self.show()
        self._emit("clipboard:link", link)

    def quit(self) -> None:
        if self._window is None or self._quitting:
            return
        if not self._confirm_quit(None):
            return
        self._quitting = True
        self._window.destroy()

    def restart(self) -> None:
        """Quit (asking first while jobs run); main.py starts a fresh process once the window is gone."""
        self.restart_requested = True
        self.quit()
        if not self._quitting:
            self.restart_requested = False  # the user chose to stay

    def _end_session(self) -> None:
        self._quitting = True

    def _session_ending(self) -> bool:
        user32 = _user32()
        return bool(user32 and user32.GetSystemMetrics(SM_SHUTTINGDOWN))

    def _hide(self) -> None:
        self._window.hide()
        if not self._settings.get("trayHintShown", False):
            self.tray.notify(self._labels["backgroundTitle"], self._labels["backgroundBody"])
            self._settings.update({"trayHintShown": True})

    def _confirm_quit(self, owner: Optional[int]) -> bool:
        user32 = _user32()
        if not user32 or not self._settings.get("confirmExitOnActiveJobs", True) or self._active_jobs() == 0:
            return True
        flags = MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2
        if owner is None:
            flags |= MB_SETFOREGROUND | MB_TOPMOST  # the window may be hidden; keep the prompt in front
        answer = user32.MessageBoxW(
            ctypes.c_void_p(owner) if owner else None,
            self._labels["quitConfirmBody"],
            self._labels["quitConfirmTitle"] or self._title,
            flags,
        )
        return answer == IDYES

    def _handle(self) -> Optional[int]:
        if self._hwnd is None and self._window is not None:
            self._hwnd = win_theme.window_handle(self._window)
        return self._hwnd

    def _window_active(self) -> bool:
        user32, hwnd = _user32(), self._handle()
        if not user32 or not hwnd:
            return False
        handle = ctypes.c_void_p(hwnd)
        return bool(user32.IsWindowVisible(handle)) and not user32.IsIconic(handle) and (
            user32.GetForegroundWindow() == hwnd
        )
