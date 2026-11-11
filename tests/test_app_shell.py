import threading
import uuid

import pytest

from backend.core import app_shell, single_instance
from backend.core.app_shell import IDYES, AppShell
from backend.core.jobs import JobManager
from backend.core.settings import Settings


class FakeWindow:
    def __init__(self) -> None:
        self.hidden = threading.Event()
        self.destroyed = False

    def hide(self) -> None:
        self.hidden.set()

    def destroy(self) -> None:
        self.destroyed = True


class FakeUser32:
    def __init__(self, answer: int = IDYES) -> None:
        self.answer = answer
        self.prompts = []

    def MessageBoxW(self, owner, body, title, flags):  # noqa: N802 - Win32 name
        self.prompts.append((body, title))
        return self.answer

    def GetSystemMetrics(self, _index):  # noqa: N802
        return 0


@pytest.fixture
def make_shell(tmp_path, monkeypatch):
    def make(active: int = 0, tray: bool = True, answer: int = IDYES, **settings):
        store = Settings(tmp_path / "settings.json")
        store.update(settings)
        shell = AppShell("Media Studio", store, lambda: active)
        user32 = FakeUser32(answer)
        monkeypatch.setattr(app_shell, "_user32", lambda: user32)
        monkeypatch.setattr(type(shell.tray), "running", property(lambda _: tray))
        notes = []
        monkeypatch.setattr(shell.tray, "notify", lambda title, body: notes.append((title, body)) or True)
        window = FakeWindow()
        shell._window = window
        shell._hwnd = 0
        return shell, window, user32, notes, store

    return make


def test_close_hides_to_tray_and_hints_once(make_shell):
    shell, window, _, notes, store = make_shell()
    assert shell.on_closing() is False
    assert window.hidden.wait(2)
    assert len(notes) == 1 and store.get("trayHintShown") is True

    window.hidden.clear()
    assert shell.on_closing() is False
    assert window.hidden.wait(2)
    assert len(notes) == 1


def test_close_quits_without_tray_setting(make_shell):
    shell, window, user32, _, _ = make_shell(closeToTray=False)
    assert shell.on_closing() is None
    assert not window.hidden.is_set() and not user32.prompts


def test_close_quits_when_tray_unavailable(make_shell):
    shell, _, _, _, _ = make_shell(tray=False)
    assert shell.on_closing() is None


def test_quit_with_active_jobs_asks_first(make_shell):
    shell, window, user32, _, _ = make_shell(active=2, answer=7)  # IDNO
    shell.quit()
    assert user32.prompts and not window.destroyed

    user32.answer = IDYES
    shell.quit()
    assert window.destroyed
    assert shell.on_closing() is None  # the close that destroy() triggers goes through


def test_quit_without_confirm_setting(make_shell):
    shell, window, user32, _, _ = make_shell(active=2, confirmExitOnActiveJobs=False)
    shell.quit()
    assert window.destroyed and not user32.prompts


def test_close_without_tray_asks_when_jobs_run(make_shell):
    shell, _, user32, _, _ = make_shell(active=1, closeToTray=False, answer=7)
    assert shell.on_closing() is False
    assert len(user32.prompts) == 1


def test_labels_reach_prompt(make_shell):
    shell, _, user32, _, _ = make_shell(active=1, closeToTray=False)
    shell.set_labels({"quitConfirmBody": "Przerwać?", "unknown": "x"})
    shell.on_closing()
    assert user32.prompts[0][0] == "Przerwać?"
    assert "unknown" not in shell._labels


def test_job_manager_active_count():
    jobs = JobManager()
    release = threading.Event()
    jobs.submit("slow", lambda ctx: release.wait(5))
    assert jobs.active_count() == 1
    release.set()
    jobs.shutdown(wait=True)
    assert jobs.active_count() == 0


def test_second_launch_reaches_running_instance():
    channel = f"test-{uuid.uuid4().hex[:8]}"
    assert single_instance.notify_running(channel) is False
    listener = single_instance.listen(channel)
    assert listener is not None
    shown = threading.Event()
    listener.serve(shown.set)
    try:
        assert single_instance.notify_running(channel) is True
        assert shown.wait(2)
    finally:
        listener.close()


def test_tray_clipboard_item_opens_the_link(make_shell, monkeypatch):
    shell, _, _, notes, _ = make_shell()
    events, shown = [], []
    shell._emit = lambda event, payload: events.append((event, payload))
    monkeypatch.setattr(shell, "show", lambda: shown.append(True))
    monkeypatch.setattr(app_shell.clipboard, "read_text", lambda: "look https://www.instagram.com/p/abc/")

    shell.download_clipboard_link()
    assert shown == [True]
    assert events == [("clipboard:link", {"url": "https://www.instagram.com/p/abc/", "target": "instagram"})]
    assert notes == []


def test_tray_clipboard_item_without_a_link_notifies(make_shell, monkeypatch):
    shell, _, _, notes, _ = make_shell()
    events = []
    shell._emit = lambda event, payload: events.append(event)
    monkeypatch.setattr(app_shell.clipboard, "read_text", lambda: "nothing here")
    shell.set_labels({"clipboardEmpty": "Brak linku"})

    shell.download_clipboard_link()
    assert events == []
    assert notes == [("Media Studio", "Brak linku")]
