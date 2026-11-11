"""Tests for backend.core.logs: dated, rotated log files that also catch uncaught errors."""

import logging
import sys
import threading

import pytest

from backend.core import logs


@pytest.fixture
def log_folder(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "excepthook", sys.excepthook)
    monkeypatch.setattr(threading, "excepthook", threading.excepthook)
    root = logging.getLogger()
    level = root.level
    yield tmp_path
    for handler in logs._installed:
        root.removeHandler(handler)
        handler.close()
    logs._installed.clear()
    root.setLevel(level)


def _read(path):
    for handler in logs._installed:
        handler.flush()
    return path.read_text(encoding="utf-8")


def test_app_messages_are_written_with_a_date(log_folder):
    path = logs.setup("test", log_folder)
    logging.getLogger("backend.core.jobs").info("Job abc (convert) done after 1.0 s")
    logging.getLogger("urllib3").info("library chatter")

    text = _read(path)
    assert path.name == "test.log"
    assert "INFO     backend.core.jobs" in text and "Job abc" in text
    assert text[:4].isdigit()  # starts with the year
    assert "library chatter" not in text


def test_setup_again_does_not_duplicate_lines(log_folder):
    logs.setup("test", log_folder)
    path = logs.setup("test", log_folder)
    logging.getLogger("backend").warning("once")
    assert _read(path).count("once") == 1


def test_the_file_rotates(log_folder, monkeypatch):
    monkeypatch.setattr(logs, "MAX_BYTES", 2_000)
    monkeypatch.setattr(logs, "BACKUP_COUNT", 2)
    path = logs.setup("test", log_folder)
    for i in range(200):
        logging.getLogger("backend").warning("line %d %s", i, "x" * 40)
    _read(path)
    assert sorted(p.name for p in log_folder.iterdir()) == ["test.log", "test.log.1", "test.log.2"]


def test_uncaught_errors_are_logged(log_folder):
    path = logs.setup("test", log_folder)

    def boom():
        raise RuntimeError("worker exploded")

    thread = threading.Thread(target=boom, name="worker-1")
    thread.start()
    thread.join()
    try:
        raise ValueError("main exploded")
    except ValueError:
        sys.excepthook(*sys.exc_info())

    text = _read(path)
    assert "Uncaught exception in thread worker-1" in text and "worker exploded" in text
    assert "Uncaught exception in main thread" in text and "main exploded" in text


def test_a_missing_stderr_is_sent_to_the_log(log_folder, monkeypatch):
    monkeypatch.setattr(sys, "stdout", None)
    monkeypatch.setattr(sys, "stderr", None)
    path = logs.setup("test", log_folder)

    print("hello from a worker")
    sys.stderr.write("Traceback (most recent call last):\n  boom\n")

    text = _read(path)
    assert "INFO     stdout" in text and "hello from a worker" in text
    assert "WARNING  stderr" in text and "  boom" in text
