"""Notification-area (tray) icon that keeps the app reachable while its window is hidden.

Also shows system notifications: Windows 10/11 render tray balloon tips as regular toasts
in Action Center. Runs pystray's message loop on its own thread; every public method is
safe to call from any thread and is a no-op when pystray is unavailable.
"""

import logging
import sys
import threading
from pathlib import Path
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)

NIN_BALLOONUSERCLICK = 0x0405  # WM_USER + 5: the user clicked the notification
NIIF_USER, NIIF_NOSOUND, NIIF_LARGE_ICON = 0x04, 0x10, 0x20  # the app plays its own chime
MAX_TITLE, MAX_BODY = 63, 255  # NOTIFYICONDATAW szInfoTitle / szInfo limits

DEFAULT_LABELS: Dict[str, str] = {"open": "Open", "clipboard": "Download link from clipboard", "quit": "Quit"}


class Tray:
    def __init__(
        self,
        title: str,
        icon_path: Path,
        on_open: Callable[[], None],
        on_quit: Callable[[], None],
        on_clipboard: Optional[Callable[[], None]] = None,
    ) -> None:
        self._title = title
        self._icon_path = icon_path
        self._on_open = on_open
        self._on_quit = on_quit
        self._on_clipboard = on_clipboard
        self._labels = dict(DEFAULT_LABELS)
        self._icon: Any = None
        self._ready = threading.Event()

    @property
    def running(self) -> bool:
        return self._ready.is_set()

    def start(self) -> bool:
        if sys.platform != "win32" or not self._icon_path.is_file():
            return False
        try:
            import pystray
            from PIL import Image
        except ImportError:
            logger.warning("pystray is not installed; tray icon disabled")
            return False

        tray = self

        class _Icon(pystray.Icon):  # type: ignore[misc, valid-type]
            def _on_notify(self, wparam: int, lparam: int) -> None:
                if lparam == NIN_BALLOONUSERCLICK:
                    tray._open()
                else:
                    super()._on_notify(wparam, lparam)

            def _notify(self, message: str, title: Optional[str] = None) -> None:
                from pystray._util import win32

                self._message(
                    win32.NIM_MODIFY,
                    win32.NIF_INFO,
                    szInfo=message,
                    szInfoTitle=title or self.title or "",
                    dwInfoFlags=NIIF_USER | NIIF_LARGE_ICON | NIIF_NOSOUND,
                )

        items = [pystray.MenuItem(lambda _: self._labels["open"], lambda: self._open(), default=True)]
        if self._on_clipboard is not None:
            items.append(pystray.MenuItem(lambda _: self._labels["clipboard"], lambda: self._clipboard()))
        items += [pystray.Menu.SEPARATOR, pystray.MenuItem(lambda _: self._labels["quit"], lambda: self._quit())]
        menu = pystray.Menu(*items)
        try:
            self._icon = _Icon("MediaStudio", Image.open(self._icon_path), self._title, menu)
            self._icon.run_detached(setup=self._setup)
        except Exception:  # noqa: BLE001 - the app works without a tray icon
            logger.exception("tray icon failed to start")
            self._icon = None
            return False
        return True

    def _setup(self, icon: Any) -> None:
        icon.visible = True
        self._ready.set()

    def set_labels(self, labels: Dict[str, str]) -> None:
        self._labels.update({k: str(v) for k, v in labels.items() if k in DEFAULT_LABELS and v})
        icon = self._icon
        if self.running and icon is not None:
            icon.update_menu()

    def notify(self, title: str, body: str) -> bool:
        icon = self._icon
        if not self.running or icon is None:
            return False
        try:
            icon.notify((body or title)[:MAX_BODY], title[:MAX_TITLE])
        except Exception:  # noqa: BLE001
            logger.exception("tray notification failed")
            return False
        return True

    def stop(self) -> None:
        if self._icon is None:
            return
        self._ready.clear()
        try:
            self._icon.stop()
        except Exception:  # noqa: BLE001 - already stopped
            pass
        self._icon = None

    def _open(self) -> None:
        threading.Thread(target=self._on_open, name="tray-open", daemon=True).start()

    def _quit(self) -> None:
        threading.Thread(target=self._on_quit, name="tray-quit", daemon=True).start()

    def _clipboard(self) -> None:
        if self._on_clipboard is not None:
            threading.Thread(target=self._on_clipboard, name="tray-clipboard", daemon=True).start()
