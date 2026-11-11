"""Log files in %APPDATA%\\MediaStudio\\logs: dated lines, a few rotated files, uncaught errors included.

Each run kind has its own file (``app.log`` for the installed app, ``dev.log`` for ``main.py --dev``),
because the two can run at the same time and Windows cannot rotate a file another process holds open.
"""

import logging
import platform
import sys
import threading
from logging.handlers import RotatingFileHandler
from pathlib import Path
from types import TracebackType
from typing import List, Optional, Type

from backend.core.paths import app_data_dir

MAX_BYTES = 1_000_000
BACKUP_COUNT = 5
FORMAT = "%(asctime)s %(levelname)-8s %(name)s [%(threadName)s] %(message)s"

logger = logging.getLogger("backend")
# Handlers added by setup(), replaced when it runs again.
_installed: List[logging.Handler] = []


def logs_dir() -> Path:
    path = app_data_dir() / "logs"
    path.mkdir(parents=True, exist_ok=True)
    return path


class _LogWriter:
    """Stands in for a missing stdout/stderr (windowed build) and sends each printed line to the log."""

    def __init__(self, target: logging.Logger, level: int) -> None:
        self._target = target
        self._level = level
        self._buffer = ""
        self.encoding = "utf-8"
        self.errors = "replace"

    def write(self, text: str) -> int:
        self._buffer += text
        *lines, self._buffer = self._buffer.split("\n")
        for line in lines:
            if line.strip():
                self._target.log(self._level, line.rstrip())
        return len(text)

    def flush(self) -> None:
        if self._buffer.strip():
            self._target.log(self._level, self._buffer.rstrip())
        self._buffer = ""

    def isatty(self) -> bool:
        return False


def _log_uncaught(
    exc_type: Type[BaseException], exc: BaseException, tb: Optional[TracebackType], where: str = "main thread"
) -> None:
    if issubclass(exc_type, KeyboardInterrupt):
        return
    logger.critical("Uncaught exception in %s", where, exc_info=(exc_type, exc, tb))


def _log_uncaught_in_thread(args: "threading.ExceptHookArgs") -> None:
    if args.exc_type is SystemExit or args.exc_value is None:
        return
    name = args.thread.name if args.thread is not None else "a thread"
    _log_uncaught(args.exc_type, args.exc_value, args.exc_traceback, f"thread {name}")


def setup(name: str, folder: Optional[Path] = None) -> Path:
    """Send logging to ``<folder>/<name>.log`` (and the console, when there is one); returns the file."""
    path = (folder or logs_dir()) / f"{name}.log"
    path.parent.mkdir(parents=True, exist_ok=True)
    handlers: List[logging.Handler] = [
        RotatingFileHandler(path, maxBytes=MAX_BYTES, backupCount=BACKUP_COUNT, encoding="utf-8")
    ]
    console = sys.stderr is not None
    if console:
        handlers.append(logging.StreamHandler(sys.stderr))

    root = logging.getLogger()
    for handler in _installed:
        root.removeHandler(handler)
        handler.close()
    _installed[:] = handlers
    for handler in handlers:
        handler.setFormatter(logging.Formatter(FORMAT))
        root.addHandler(handler)
    # Libraries stay at warnings; the app's own modules (all under "backend") report what they do.
    root.setLevel(logging.WARNING)
    logger.setLevel(logging.INFO)

    if not console:
        for stream, level in (("stdout", logging.INFO), ("stderr", logging.WARNING)):
            target = logging.getLogger(stream)
            target.setLevel(level)
            if getattr(sys, stream) is None:
                setattr(sys, stream, _LogWriter(target, level))

    sys.excepthook = _log_uncaught
    threading.excepthook = _log_uncaught_in_thread
    return path


def log_start(app_name: str, version: str) -> None:
    logger.info(
        "%s %s starting (Python %s, %s%s)",
        app_name,
        version,
        platform.python_version(),
        platform.platform(),
        ", packaged" if getattr(sys, "frozen", False) else "",
    )
