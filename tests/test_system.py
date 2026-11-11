"""Tests for backend.core.system: opening paths from the window never runs a program."""

import pytest

from backend.core import system


@pytest.fixture
def calls(monkeypatch):
    seen = []
    monkeypatch.setattr(system.os, "startfile", lambda path: seen.append(("open", path)), raising=False)
    monkeypatch.setattr(system.subprocess, "Popen", lambda args: seen.append(("popen", args)))
    monkeypatch.setattr(system.sys, "platform", "win32")
    return seen


@pytest.mark.parametrize("name", ["setup.exe", "run.BAT", "link.lnk", "page.url", "script.ps1", "x.hta"])
def test_a_runnable_file_is_shown_in_explorer_instead(tmp_path, calls, name):
    target = tmp_path / name
    target.write_bytes(b"MZ")

    system.open_path(str(target))

    assert calls == [("popen", ["explorer", "/select,", str(target)])]


def test_trailing_dots_and_spaces_do_not_hide_a_program(tmp_path):
    assert system.is_runnable(tmp_path / "evil.exe. ")
    assert system.is_runnable(tmp_path / "evil.exe...")


def test_a_type_registered_in_pathext_is_not_opened(tmp_path, calls, monkeypatch):
    monkeypatch.setenv("PATHEXT", ".COM;.EXE;.MYRUN")
    target = tmp_path / "tool.myrun"
    target.write_bytes(b"")

    system.open_path(str(target))

    assert calls == [("popen", ["explorer", "/select,", str(target)])]


@pytest.mark.parametrize("name", ["clip.mp4", "photo.JPG", "notes.srt", "doc.pdf"])
def test_media_and_documents_open_normally(tmp_path, calls, name):
    target = tmp_path / name
    target.write_bytes(b"")

    system.open_path(str(target))

    assert calls == [("open", str(target))]


def test_a_folder_opens_even_when_named_like_a_program(tmp_path, calls):
    folder = tmp_path / "game.exe"
    folder.mkdir()

    system.open_path(str(folder))

    assert calls == [("open", str(folder))]


def test_a_missing_path_raises(tmp_path, calls):
    with pytest.raises(FileNotFoundError):
        system.open_path(str(tmp_path / "missing.mp4"))
