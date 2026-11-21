"""The window bridge: every call the frontend makes exists in Python, and the bridge refuses what it must."""

import inspect
import re
from pathlib import Path
from types import SimpleNamespace

import fitz
import pytest
from PIL import Image

from backend.bridge import api
from backend.core import system
from backend.core.errors import AppError
from backend.core.settings import Settings
from backend.services import compressor, pdf
from backend.services.converter import ConvertOptions, convert

ROOT = Path(__file__).resolve().parents[1]
BRIDGE_TS = ROOT / "frontend" / "src" / "lib" / "bridge.ts"
CALL_RE = re.compile(r"""\bcall<[^(]*>\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']""", re.DOTALL)
NAMESPACE_RE = re.compile(r"self\.(\w+) = (\w+)\(self\._ctx\)")
POLISH_DIR = "Zdjęcia z wakacji ąćęłńóśźż"


def _frontend_calls():
    return sorted(set(CALL_RE.findall(BRIDGE_TS.read_text(encoding="utf-8"))))


def _namespaces():
    return {ns: getattr(api, cls) for ns, cls in NAMESPACE_RE.findall(inspect.getsource(api.Api.__init__))}


def test_bridge_ts_is_parsed():
    source = BRIDGE_TS.read_text(encoding="utf-8")
    assert len(CALL_RE.findall(source)) == source.count("call<") - 1  # every call except its definition
    calls = _frontend_calls()
    assert ("settings", "update") in calls
    assert ("download", "batch") in calls


@pytest.mark.parametrize("ns, method", _frontend_calls())
def test_every_frontend_call_has_a_python_method(ns, method):
    namespaces = _namespaces()
    assert ns in namespaces, f"api.{ns} is not exposed by Api"
    target = getattr(namespaces[ns], method, None)
    assert callable(target), f"{namespaces[ns].__name__}.{method} is missing"
    assert not method.startswith("_")


class _Jobs:
    def __init__(self):
        self.limits = []

    def set_limit(self, limit):
        self.limits.append(limit)


class _Hotkey:
    def __init__(self, taken=()):
        self.taken = set(taken)
        self.combo = ""

    def set(self, combo):
        if combo in self.taken:
            raise AppError("errors.hotkeyTaken")
        self.combo = combo


@pytest.fixture
def settings_api(tmp_path):
    ctx = SimpleNamespace(
        settings=Settings(tmp_path / "settings.json"), jobs=_Jobs(), hotkey=_Hotkey({"ctrl+alt+y"}), hotkey_taken=True
    )
    return api.SettingsApi(ctx)


def test_taken_hotkey_is_not_saved(settings_api):
    assert settings_api.update({"globalHotkey": "ctrl+alt+d"})["globalHotkey"] == "ctrl+alt+d"
    assert settings_api._ctx.hotkey_taken is False
    with pytest.raises(AppError):
        settings_api.update({"globalHotkey": "ctrl+alt+y", "theme": "dark"})
    assert settings_api.get()["globalHotkey"] == "ctrl+alt+d"
    assert settings_api.get()["theme"] != "dark"
    assert settings_api._ctx.hotkey.combo == "ctrl+alt+d"
    assert settings_api.reset()["globalHotkey"] == ""
    assert settings_api._ctx.hotkey.combo == ""


def test_settings_update_applies_known_keys(settings_api):
    updated = settings_api.update({"theme": "dark", "maxConcurrency": 2})
    assert updated["theme"] == "dark"
    assert settings_api._ctx.jobs.limits == [2]


@pytest.mark.parametrize(
    "patch",
    [{"unknownKey": 1}, {"theme": "dark", "notASetting": True}, {"recentFolders": ["C:/x"]}, {"cookies": {"other": ""}}],
)
def test_settings_update_refuses_unknown_keys(settings_api, patch):
    before = settings_api.get()
    with pytest.raises(ValueError):
        settings_api.update(patch)
    assert settings_api.get() == before
    assert not settings_api._ctx.settings.path.exists()


@pytest.fixture
def opened(monkeypatch):
    seen = []
    monkeypatch.setattr(system.os, "startfile", lambda path: seen.append(("open", path)), raising=False)
    monkeypatch.setattr(system.subprocess, "Popen", lambda args: seen.append(("popen", args)))
    monkeypatch.setattr(system.sys, "platform", "win32")
    return seen


@pytest.mark.parametrize("name", ["setup.exe", "instalator ąę.EXE", "skrypt.bat"])
def test_bridge_never_runs_a_program(tmp_path, opened, name):
    target = tmp_path / name
    target.write_bytes(b"MZ")

    api.SystemApi(SimpleNamespace()).open_path(str(target))

    assert opened == [("popen", ["explorer", "/select,", str(target)])]


def test_bridge_opens_a_document(tmp_path, opened):
    target = tmp_path / "raport ąę.pdf"
    target.write_bytes(b"%PDF")

    api.SystemApi(SimpleNamespace()).open_path(str(target))

    assert opened == [("open", str(target))]


def test_bridge_reports_a_missing_file(tmp_path, opened):
    bridge = api.SystemApi(SimpleNamespace())
    with pytest.raises(RuntimeError, match="errors.pathMissing"):
        bridge.open_path(str(tmp_path / "gone.mp4"))
    with pytest.raises(RuntimeError, match="errors.pathMissing"):
        bridge.reveal(str(tmp_path / "gone folder" / "gone.mp4"))
    # A missing file whose folder is still there opens that folder instead.
    bridge.reveal(str(tmp_path / "gone.mp4"))
    assert opened == [("open", str(tmp_path))]


@pytest.fixture
def polish_dir(tmp_path):
    folder = tmp_path / POLISH_DIR
    folder.mkdir()
    return folder


def _image(path, size=(60, 40)):
    Image.new("RGB", size, (200, 30, 30)).save(path)
    return path


def _pdf(path, pages):
    doc = fitz.open()
    for label in pages:
        doc.new_page(width=200, height=300).insert_text((20, 50), label)
    doc.save(str(path))
    doc.close()
    return path


def test_converter_handles_polish_paths(polish_dir, ctx):
    src = _image(polish_dir / "żółw na plaży.png")
    out = polish_dir / "wynik ęą"
    result = convert(ctx, ConvertOptions(files=[str(src)], output_dir=str(out), out_fmt="WEBP"))
    assert result["converted"] == 1 and result["failed"] == 0
    assert (out / "żółw na plaży.webp").is_file()


def test_converter_folder_mode_handles_polish_paths(polish_dir, ctx):
    _image(polish_dir / "źdźbło 1.png")
    out = polish_dir / "wyniki"
    result = convert(ctx, ConvertOptions(input_dir=str(polish_dir), in_fmt="PNG", output_dir=str(out), out_fmt="JPEG"))
    assert result["converted"] == 1
    assert (out / "źdźbło 1.jpg").is_file()


def test_compressor_handles_polish_paths(polish_dir, ctx):
    src = _image(polish_dir / "ćma nocą.png", (300, 300))
    out = polish_dir / "skompresowane śń"
    result = compressor.compress(ctx, {"files": [str(src)], "outputDir": str(out), "format": "webp", "mode": "smart"})
    assert result["processed"] == 1
    assert list(out.glob("*.webp"))
    assert compressor.load_preview(str(src))


def test_pdf_tools_handle_polish_paths(polish_dir, ctx):
    a = _pdf(polish_dir / "umowa część 1.pdf", ["A1", "A2"])
    b = _pdf(polish_dir / "aneks ł.pdf", ["B1"])

    merged = polish_dir / "scalone ąę" / "całość.pdf"
    result = pdf.merge(ctx, [{"file": str(a), "page": 0}, {"file": str(b), "page": 0}], str(merged))
    assert result["pageCount"] == 2 and merged.is_file()

    assert pdf.inspect(ctx, [str(a)])
    assert pdf.render_page(str(a), 0).startswith("data:image/jpeg;base64,")

    compressed = polish_dir / "mniejszy żółty.pdf"
    pdf.compress(ctx, str(a), str(compressed))
    assert compressed.is_file()

    split_dir = polish_dir / "podział"
    pdf.split(ctx, str(a), str(split_dir), mode="all")
    assert len(list(split_dir.glob("*.pdf"))) == 2

    images_dir = polish_dir / "obrazy stron"
    pdf.pdf_to_images(ctx, str(b), str(images_dir), fmt="png", dpi=72)
    assert len(list(images_dir.glob("*.png"))) == 1

    image = _image(polish_dir / "skan ś.png")
    from_images = polish_dir / "ze zdjęć.pdf"
    pdf.images_to_pdf(ctx, [str(image)], str(from_images))
    assert from_images.is_file()

    text = polish_dir / "tekst ź.txt"
    pdf.extract_text(ctx, str(a), str(text))
    assert "A1" in text.read_text(encoding="utf-8")


def test_installing_a_dependency_twice_follows_the_running_install(monkeypatch):
    import threading

    from backend.core.jobs import JobManager
    from backend.services import deps_installer

    release = threading.Event()
    monkeypatch.setattr(deps_installer, "install_dependency", lambda ctx, dep_id: release.wait(5))
    jobs = JobManager(max_workers=1)
    try:
        system_api = api.SystemApi(SimpleNamespace(jobs=jobs))
        first = system_api.install_dependency("rembg")
        assert system_api.install_dependency("rembg") == first
        assert system_api.install_dependency("lama") != first
    finally:
        release.set()
        jobs.shutdown()


def test_the_bridge_can_be_built(app_dirs):
    from backend.bridge.events import EventBus

    bridge = api.Api(EventBus(), Settings(app_dirs / "settings.json"))
    assert set(_namespaces()) <= set(vars(bridge))
    assert bridge._ctx.history.path.is_relative_to(app_dirs)
