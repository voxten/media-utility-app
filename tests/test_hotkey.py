import queue
import threading

import pytest

from backend.core import hotkey
from backend.core.errors import AppError
from backend.core.settings import CHOICES


class FakeUser32:
    """One message queue, like the hotkey thread's, and a set of combinations other programs own."""

    def __init__(self, taken=()):
        self.taken = set(taken)
        self.messages: "queue.Queue[int]" = queue.Queue()
        self.registered = {}
        self.calls = []

    def create_queue(self):
        self.calls.append(("create_queue", threading.current_thread().name))

    def next_message(self):
        message = self.messages.get(timeout=5)
        return None if message == hotkey.WM_QUIT else message

    def post(self, thread_id, message):
        self.messages.put(message)
        return True

    def register(self, hotkey_id, modifiers, key):
        if (modifiers & ~hotkey.MOD_NOREPEAT, key) in self.taken:
            return hotkey.ERROR_HOTKEY_ALREADY_REGISTERED
        assert modifiers & hotkey.MOD_NOREPEAT
        self.registered[hotkey_id] = (modifiers, key)
        self.calls.append(("register", threading.current_thread().name))
        return 0

    def unregister(self, hotkey_id):
        self.registered.pop(hotkey_id, None)
        self.calls.append(("unregister", threading.current_thread().name))


def test_combos_match_the_setting_choices():
    assert CHOICES["globalHotkey"] == frozenset({"", *hotkey.COMBOS})


def test_combos_avoid_polish_altgr_letters():
    for modifiers, key in hotkey.COMBOS.values():
        assert chr(key) not in "ACELNOSUXZ"


def test_taken_hotkey_raises_and_keeps_the_previous_one():
    user32 = FakeUser32(taken={hotkey.COMBOS["ctrl+alt+y"]})
    keys = hotkey.GlobalHotkey(lambda: None, user32)
    try:
        keys.set("ctrl+alt+d")
        with pytest.raises(AppError) as error:
            keys.set("ctrl+alt+y")
        assert error.value.key == "errors.hotkeyTaken"
        assert keys.combo == "ctrl+alt+d"
        assert [value[1] for value in user32.registered.values()] == [ord("D")]
    finally:
        keys.stop()


def test_switching_replaces_and_off_unregisters():
    user32 = FakeUser32()
    keys = hotkey.GlobalHotkey(lambda: None, user32)
    try:
        keys.set("ctrl+alt+d")
        keys.set("ctrl+alt+shift+y")
        modifiers, key = hotkey.COMBOS["ctrl+alt+shift+y"]
        assert list(user32.registered.values()) == [(modifiers | hotkey.MOD_NOREPEAT, key)]
        keys.set("")
        assert user32.registered == {}
    finally:
        keys.stop()


def test_hotkey_message_runs_the_callback():
    fired = threading.Event()
    user32 = FakeUser32()
    keys = hotkey.GlobalHotkey(fired.set, user32)
    try:
        keys.set("ctrl+alt+d")
        user32.messages.put(hotkey.WM_HOTKEY)
        assert fired.wait(2)
    finally:
        keys.stop()


def test_stop_unregisters_on_its_own_thread():
    user32 = FakeUser32()
    keys = hotkey.GlobalHotkey(lambda: None, user32)
    keys.set("ctrl+alt+d")
    keys.stop()
    assert user32.registered == {}
    assert keys.combo == ""
    names = {name for call, name in user32.calls}
    assert names == {"global-hotkey"}


def test_unknown_combo_is_refused():
    with pytest.raises(ValueError):
        hotkey.GlobalHotkey(lambda: None, FakeUser32()).set("ctrl+alt+a")
