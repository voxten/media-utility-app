import errno
import threading

import pytest

from backend.core.errors import AppError, MissingFile, describe
from backend.core.jobs import JobManager


def test_app_error_sends_the_key_and_its_values():
    assert str(AppError("errors.diskFull")) == "errors.diskFull"
    assert str(AppError("errors.fileMissing", file="żółw.png")) == 'errors.fileMissing|{"file": "żółw.png"}'


def test_missing_file_is_still_a_file_not_found_error(tmp_path):
    with pytest.raises(FileNotFoundError):
        raise MissingFile(tmp_path / "gone.mp4")
    assert str(MissingFile(tmp_path / "gone.mp4")) == 'errors.fileMissing|{"file": "gone.mp4"}'


def test_common_windows_failures_become_keys(tmp_path):
    locked = PermissionError(13, "Permission denied", str(tmp_path / "film.mp4"))
    assert describe(locked) == 'errors.fileLocked|{"file": "film.mp4"}'
    assert describe(FileNotFoundError(2, "No such file", "C:/x/a.png")) == 'errors.fileMissing|{"file": "a.png"}'
    assert describe(OSError(errno.ENOSPC, "No space left on device")) == "errors.diskFull"
    assert describe(MemoryError()) == "errors.outOfMemory"
    assert describe(ValueError("yt-dlp said no")) == "yt-dlp said no"


def test_a_failed_job_reports_the_described_error():
    errors = []
    finished = threading.Event()

    def emit(event, payload):
        if event == "job:error":
            errors.append(payload["error"])
            finished.set()

    def job(ctx):
        raise PermissionError(13, "Permission denied", "C:/videos/locked.mp4")

    manager = JobManager(emit)
    manager.submit("test", job)
    assert finished.wait(5)
    assert errors == ['errors.fileLocked|{"file": "locked.mp4"}']
