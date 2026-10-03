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


def set_window_icon(window: Any, ico_path: str) -> bool:
    """Title bar / taskbar icon from an .ico file (needed when running unfrozen via python.exe)."""
    hwnd = window_handle(window)
    if not hwnd or sys.platform != "win32":
        return False
    user32 = ctypes.windll.user32
    user32.LoadImageW.restype = ctypes.c_void_p
    IMAGE_ICON, LR_LOADFROMFILE = 1, 0x10
    WM_SETICON, ICON_SMALL, ICON_BIG = 0x80, 0, 1
    ok = False
    for kind, metric_x, metric_y in ((ICON_BIG, 11, 12), (ICON_SMALL, 49, 50)):  # SM_CXICON / SM_CXSMICON
        size_x, size_y = user32.GetSystemMetrics(metric_x), user32.GetSystemMetrics(metric_y)
        hicon = user32.LoadImageW(None, ico_path, IMAGE_ICON, size_x, size_y, LR_LOADFROMFILE)
        if hicon:
            user32.SendMessageW(ctypes.c_void_p(hwnd), WM_SETICON, kind, ctypes.c_void_p(hicon))
            ok = True
    return ok


class _Margins(ctypes.Structure):
    _fields_ = [("left", ctypes.c_int), ("right", ctypes.c_int), ("top", ctypes.c_int), ("bottom", ctypes.c_int)]


def mica_supported() -> bool:
    """Mica (DWMWA_SYSTEMBACKDROP_TYPE) needs Windows 11 22H2+ (build 22621)."""
    return sys.platform == "win32" and sys.getwindowsversion().build >= 22621


def enable_mica(window: Any) -> bool:
    """Show the Mica backdrop behind a transparent pywebview window.

    Requires the window to be created with ``transparent=True``. DWM draws the backdrop
    where the client area is black, so the WinForms form background is set to black and
    the frame is extended over the whole client area.
    """
    hwnd = window_handle(window)
    if not hwnd or not mica_supported():
        return False
    try:
        from System import Action  # pythonnet, available with the WinForms backend
        from System.Drawing import Color

        window.native.Invoke(Action(lambda: setattr(window.native, "BackColor", Color.Black)))
    except Exception:  # noqa: BLE001
        return False
    margins = _Margins(-1, -1, -1, -1)
    ctypes.windll.dwmapi.DwmExtendFrameIntoClientArea(ctypes.c_void_p(hwnd), ctypes.byref(margins))
    return _set_attribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, DWMSBT_MAINWINDOW)
