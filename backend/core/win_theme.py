"""Windows 11 title bar styling through DWM (no-op on other platforms)."""

import ctypes
import sys
from typing import Any, Optional

DWMWA_USE_IMMERSIVE_DARK_MODE = 20
DWMWA_SYSTEMBACKDROP_TYPE = 38
DWMSBT_MAINWINDOW = 2  # Mica


def window_handle(window: Any) -> Optional[int]:
    native = getattr(window, "native", None)
    handle = getattr(native, "Handle", None)
    if handle is None:
        return None
    try:
        return int(handle.ToInt64())
    except Exception:  # noqa: BLE001
        return None


def _set_attribute(hwnd: int, attribute: int, value: int) -> bool:
    if sys.platform != "win32":
        return False
    data = ctypes.c_int(value)
    result = ctypes.windll.dwmapi.DwmSetWindowAttribute(
        ctypes.c_void_p(hwnd), ctypes.c_uint(attribute), ctypes.byref(data), ctypes.sizeof(data)
    )
    return result == 0


def set_dark_title_bar(window: Any, dark: bool) -> bool:
    hwnd = window_handle(window)
    if not hwnd:
        return False
    ok = _set_attribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, 1 if dark else 0)
    if ok:
        # Force a non-client repaint so the colour change is visible immediately.
        SWP_FLAGS = 0x0001 | 0x0002 | 0x0004 | 0x0020  # NOSIZE | NOMOVE | NOZORDER | FRAMECHANGED
        ctypes.windll.user32.SetWindowPos(ctypes.c_void_p(hwnd), None, 0, 0, 0, 0, SWP_FLAGS)
    return ok
