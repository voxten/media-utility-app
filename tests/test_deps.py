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
    assert {"ffmpeg", "mediainfo", "lama", "rembg", "upscale_general", "upscale_anime"} == ids

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
