"""Failures the user can act on, sent to the UI as i18n keys instead of English sentences."""

import errno
import json
from pathlib import Path
from typing import Any, Union


class AppError(Exception):
    """``key`` is an i18n key (``errors.*``), ``params`` its values.

    ``str()`` is what the UI receives: the key, followed by the params as JSON after "|" when there
    are any (``lib/jobMessage.ts`` translates both forms). Technical details belong in the log.
    """

    def __init__(self, key: str, **params: Any) -> None:
        super().__init__(key)
        self.key = key
        self.params = params

    def __str__(self) -> str:
        if not self.params:
            return self.key
        return f"{self.key}|{json.dumps(self.params, ensure_ascii=False, default=str)}"


class MissingFile(AppError, FileNotFoundError):
    def __init__(self, path: Union[str, Path]) -> None:
        AppError.__init__(self, "errors.fileMissing", file=Path(path).name or str(path))


def describe(exc: BaseException) -> str:
    """What the UI receives for a failure: an AppError as is, common Windows file errors as keys."""
    if isinstance(exc, AppError):
        return str(exc)
    name = Path(exc.filename).name if isinstance(exc, OSError) and exc.filename else ""
    if isinstance(exc, PermissionError) and name:
        return str(AppError("errors.fileLocked", file=name))
    if isinstance(exc, FileNotFoundError) and name:
        return str(MissingFile(name))
    if isinstance(exc, OSError) and exc.errno == errno.ENOSPC:
        return "errors.diskFull"
    if isinstance(exc, MemoryError):
        return "errors.outOfMemory"
    return str(exc)
