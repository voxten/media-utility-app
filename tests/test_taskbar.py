import sys
import threading
import time

import pytest

from backend.core import taskbar


def test_clamp_state():
    assert taskbar.clamp_state("normal", 50) == (2, 500)
    assert taskbar.clamp_state("normal", 150) == (2, 1000)
    assert taskbar.clamp_state("bogus", -5) == (0, 0)


@pytest.mark.skipif(sys.platform != "win32", reason="Windows taskbar")
def test_progress_without_window_does_not_spin():
    progress = taskbar.TaskbarProgress(lambda: None)
    progress.set("normal", 40)
    progress.set("none")
    time.sleep(0.3)
    assert progress._thread is not None and progress._thread.is_alive()
    assert progress._applied == progress._latest == (0, 0)
    assert threading.active_count() < 50
