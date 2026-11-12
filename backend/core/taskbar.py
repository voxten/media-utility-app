"""Job progress on the app's taskbar button (ITaskbarList3), driven from the jobs the window shows.

COM objects belong to the thread that made them, so one worker thread owns the taskbar object
and applies only the latest state it was given.
"""

import ctypes
import logging
import sys
import threading
from ctypes import wintypes
from typing import Callable, Optional, Tuple

logger = logging.getLogger(__name__)

STATES = {"none": 0, "indeterminate": 1, "normal": 2, "error": 4, "paused": 8}
PROGRESS_TOTAL = 1000
CLSID_TASKBAR_LIST = "{56FDF344-FD6D-11d0-958A-006097C9A090}"
IID_TASKBAR_LIST3 = "{EA1AFB91-9E28-4B86-90E9-9E9F8A5EEFAF}"
# Positions in the ITaskbarList3 vtable (IUnknown 0-2, ITaskbarList 3-7, ITaskbarList2 8).
HR_INIT = 3
SET_PROGRESS_VALUE = 9
SET_PROGRESS_STATE = 10
CLSCTX_INPROC_SERVER = 1
COINIT_APARTMENTTHREADED = 2


class _GUID(ctypes.Structure):
    _fields_ = [("Data1", ctypes.c_ulong), ("Data2", ctypes.c_ushort), ("Data3", ctypes.c_ushort), ("Data4", ctypes.c_ubyte * 8)]


def _guid(text: str) -> _GUID:
    guid = _GUID()
    ctypes.oledll.ole32.CLSIDFromString(ctypes.c_wchar_p(text), ctypes.byref(guid))
    return guid


def clamp_state(state: str, value: float) -> Tuple[int, int]:
    """Taskbar flag and progress out of PROGRESS_TOTAL for a state name and a 0-100 value."""
    flag = STATES.get(state, 0)
    return flag, int(max(0.0, min(100.0, float(value))) * PROGRESS_TOTAL / 100)


class _TaskbarList:
    def __init__(self) -> None:
        self._ptr = ctypes.c_void_p()
        ctypes.oledll.ole32.CoCreateInstance(
            ctypes.byref(_guid(CLSID_TASKBAR_LIST)), None, CLSCTX_INPROC_SERVER,
            ctypes.byref(_guid(IID_TASKBAR_LIST3)), ctypes.byref(self._ptr),
        )
        self._call(HR_INIT, ctypes.HRESULT, [])

    def _call(self, index: int, restype, args: list, argtypes: Optional[list] = None) -> int:
        vtable = ctypes.cast(self._ptr, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
        proto = ctypes.WINFUNCTYPE(restype, ctypes.c_void_p, *(argtypes or []))
        return proto(vtable[index])(self._ptr, *args)

    def set(self, hwnd: int, flag: int, value: int) -> None:
        self._call(SET_PROGRESS_STATE, ctypes.HRESULT, [hwnd, flag], [wintypes.HWND, ctypes.c_int])
        if flag in (STATES["normal"], STATES["error"], STATES["paused"]):
            self._call(SET_PROGRESS_VALUE, ctypes.HRESULT, [hwnd, value, PROGRESS_TOTAL],
                       [wintypes.HWND, ctypes.c_ulonglong, ctypes.c_ulonglong])


class TaskbarProgress:
    def __init__(self, hwnd: Callable[[], Optional[int]]) -> None:
        self._hwnd = hwnd
        self._latest: Optional[Tuple[int, int]] = None
        self._applied: Optional[Tuple[int, int]] = None
        self._wake = threading.Condition()
        self._thread: Optional[threading.Thread] = None
        self._broken = sys.platform != "win32"

    def set(self, state: str, value: float = 0.0) -> None:
        if self._broken:
            return
        with self._wake:
            self._latest = clamp_state(state, value)
            if self._thread is None:
                self._thread = threading.Thread(target=self._run, name="taskbar-progress", daemon=True)
                self._thread.start()
            self._wake.notify()

    def _run(self) -> None:
        try:
            ctypes.oledll.ole32.CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            taskbar = _TaskbarList()
        except OSError as exc:
            logger.info("Taskbar progress unavailable: %s", exc)
            self._broken = True
            return
        while True:
            with self._wake:
                while self._latest == self._applied:
                    self._wake.wait()
                latest = self._latest
            hwnd = self._hwnd()
            if not hwnd or latest is None:
                self._applied = latest
                continue
            try:
                taskbar.set(hwnd, *latest)
                self._applied = latest
            except OSError as exc:
                logger.info("Taskbar progress failed: %s", exc)
                self._applied = latest
