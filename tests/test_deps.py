from pathlib import Path
import os
import pytest

from backend.core import deps
from backend.services import deps_installer, watermark
from backend.core.jobs import JobContext


def test_check_dependencies_structure():
    result = deps.check_dependencies()
    assert isinstance(result, list)
    ids = {d["id"] for d in result}
    assert {
        "ffmpeg", "gifsicle", "mediainfo", "lama", "rembg", "upscale_general", "upscale_anime",
        "whisper_base", "whisper_small", "whisper_turbo",
    } == ids

    for d in result:
        assert "ok" in d
        assert "detail" in d
        assert "usedBy" in d
        assert "required" in d
        assert "installable" in d


def test_is_lama_ready_detection(monkeypatch, tmp_path):
    # Case 1: torch not present
    monkeypatch.setattr(deps, "_has_module", lambda m: False)
    assert not deps.is_lama_ready()

    # Case 2: torch present, model file present
    monkeypatch.setattr(deps, "_has_module", lambda m: m == "torch")
    model_file = tmp_path / "big-lama.pt"
    model_file.write_bytes(b"0" * 105_000_000)
    monkeypatch.setattr(deps, "lama_model_path", lambda: model_file)
    assert deps.is_lama_ready()
    assert watermark.lama_available()

    # Case 3: torch present, model missing, iopaint missing
    monkeypatch.setattr(deps, "lama_model_path", lambda: None)
    assert not deps.is_lama_ready()


def test_ensure_app_paths_adds_bin(monkeypatch, tmp_path):
    monkeypatch.setattr(deps, "app_data_dir", lambda: tmp_path)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    (bin_dir / "ffmpeg.exe").write_bytes(b"")

    monkeypatch.setenv("PATH", "C:\\Windows")
    deps.ensure_app_paths()
    assert str(bin_dir) in os.environ["PATH"]


def test_install_unknown_dependency_raises():
    ctx = JobContext()
    with pytest.raises(ValueError, match="Unknown or unsupported"):
        deps_installer.install_dependency(ctx, "nonexistent_dependency")


def test_install_lama_when_already_ready(monkeypatch):
    monkeypatch.setattr(deps_installer, "is_lama_ready", lambda: True)
    ctx = JobContext()
    res = deps_installer.install_dependency(ctx, "lama")
    assert res == {"id": "lama", "ok": True}


def test_is_rembg_ready_detection(monkeypatch):
    monkeypatch.setattr(deps, "_has_module", lambda m: m in ("rembg", "onnxruntime"))
    assert deps.is_rembg_ready()

    monkeypatch.setattr(deps, "_has_module", lambda m: m == "rembg")
    assert not deps.is_rembg_ready()


def test_install_rembg_when_already_ready(monkeypatch):
    monkeypatch.setattr(deps_installer, "is_rembg_ready", lambda: True)
    ctx = JobContext()
    res = deps_installer.install_dependency(ctx, "rembg")
    assert res == {"id": "rembg", "ok": True}


class _FakeResponse:
    def __init__(self, data: bytes) -> None:
        self._data = data
        self.headers = {"Content-Length": str(len(data))}

    def read(self, size: int) -> bytes:
        chunk, self._data = self._data[:size], self._data[size:]
        return chunk

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _serve(monkeypatch, data: bytes) -> None:
    monkeypatch.setattr(deps_installer.urllib.request, "urlopen", lambda req, timeout=0: _FakeResponse(data))


def test_download_keeps_a_file_whose_sha256_matches(monkeypatch, tmp_path, ctx):
    import hashlib

    _serve(monkeypatch, b"model weights")
    target = tmp_path / "models" / "model.pth"
    expected = hashlib.sha256(b"model weights").hexdigest()

    deps_installer._download_file_with_progress(ctx, "https://example.com/m", target, expected_sha256=expected.upper())

    assert target.read_bytes() == b"model weights"


def test_download_throws_away_a_file_whose_sha256_differs(monkeypatch, tmp_path, ctx):
    _serve(monkeypatch, b"tampered")
    target = tmp_path / "model.pth"

    with pytest.raises(ValueError, match="SHA-256 mismatch"):
        deps_installer._download_file_with_progress(ctx, "https://example.com/m", target, expected_sha256="0" * 64)

    assert list(tmp_path.iterdir()) == []


def test_download_without_a_known_sha256_is_refused(monkeypatch, tmp_path, ctx):
    _serve(monkeypatch, b"anything")
    with pytest.raises(ValueError, match="No SHA-256"):
        deps_installer._download_file_with_progress(ctx, "https://example.com/m", tmp_path / "f", expected_sha256="")
    assert list(tmp_path.iterdir()) == []


def test_every_download_has_a_pinned_sha256():
    from backend.core import whisper_models

    pinned = [deps.LAMA_EXPECTED_SHA256, deps_installer.FFMPEG_WINDOWS_SHA256, deps_installer.GIFSICLE_WINDOWS_SHA256]
    pinned += [cfg["sha256"] for cfg in deps_installer.UPSCALE_MODELS.values()]
    for model in whisper_models.MODELS.values():
        assert set(model.sha256) == set(model.files), model.id
        pinned += model.sha256.values()
    assert all(len(h) == 64 and int(h, 16) >= 0 for h in pinned)
