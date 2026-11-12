from pathlib import Path
import os
import pytest

from backend.core.errors import AppError
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


@pytest.fixture
def rembg_models(monkeypatch, tmp_path):
    """An empty models folder and a 3-byte stand-in for each background removal model."""
    import hashlib

    monkeypatch.setattr(deps, "models_dir", lambda: tmp_path)
    monkeypatch.setattr(deps_installer, "models_dir", lambda: tmp_path)
    fake = {
        name: deps.RemBgModel(model.file, 3, hashlib.sha256(b"onx").hexdigest())
        for name, model in deps.REMBG_MODELS.items()
    }
    monkeypatch.setattr(deps, "REMBG_MODELS", fake)
    monkeypatch.setattr(deps_installer, "REMBG_MODELS", fake)
    return tmp_path


def _put_model(folder, name, data=b"onx"):
    (folder / f"{name}.onnx").write_bytes(data)


def test_rembg_is_ready_only_with_its_packages_and_the_default_model(monkeypatch, rembg_models):
    monkeypatch.setattr(deps, "_has_module", lambda m: m in ("rembg", "onnxruntime"))
    assert not deps.is_rembg_ready()
    rembg = next(d for d in deps.check_dependencies() if d["id"] == "rembg")
    assert (rembg["detail"], rembg["sizeEstimate"]) == ("settings.deps.detailRembgModelOnly", "~930 MB")

    _put_model(rembg_models, "birefnet-general", b"cut")
    assert deps.rembg_model_path("birefnet-general") is not None
    _put_model(rembg_models, "birefnet-general", b"cu")
    assert deps.rembg_model_path("birefnet-general") is None, "an interrupted copy does not count"

    newer_layout = rembg_models / "models" / "birefnet-general"
    newer_layout.mkdir(parents=True)
    _put_model(newer_layout, "birefnet-general")
    assert deps.is_rembg_ready()

    monkeypatch.setattr(deps, "_has_module", lambda m: m == "rembg")
    assert not deps.is_rembg_ready()


def test_installing_rembg_downloads_the_default_model_with_progress(monkeypatch, rembg_models, ctx):
    monkeypatch.setattr(deps_installer, "rembg_packages_ready", lambda: True)
    monkeypatch.setattr(deps_installer, "_run_pip", lambda *a, **k: pytest.fail("packages are already there"))
    requested = []

    def urlopen(req, timeout=0):
        requested.append(req.full_url)
        return _FakeResponse(b"onx")

    monkeypatch.setattr(deps_installer.urllib.request, "urlopen", urlopen)

    assert deps_installer.install_dependency(ctx, "rembg") == {"id": "rembg", "ok": True}
    assert requested == [deps.REMBG_RELEASE_URL + "BiRefNet-general-epoch_244.onnx"]
    assert (rembg_models / "birefnet-general.onnx").read_bytes() == b"onx"
    assert any(p["message"] == "deps.status.downloadingModel" for p in ctx.of("job:progress"))

    deps_installer.install_dependency(ctx, "rembg")
    assert len(requested) == 1, "a downloaded model is not fetched again"


def test_a_rembg_model_that_fails_its_checksum_is_not_kept(monkeypatch, rembg_models, ctx):
    _serve(monkeypatch, b"bad")
    with pytest.raises(AppError, match="errors.downloadCorrupted"):
        deps_installer.download_rembg_model(ctx, "u2net")
    assert list(rembg_models.iterdir()) == []


def test_background_removal_fetches_another_model_before_using_it(monkeypatch, rembg_models, ctx):
    from backend.services import rembg_service

    fetched = []
    monkeypatch.setattr(rembg_service, "packages_installed", lambda: True)
    monkeypatch.setattr(deps_installer, "download_rembg_model", lambda c, name, *a: fetched.append(name))
    monkeypatch.setattr(rembg_service, "_get_rembg_session", lambda name: pytest.skip("stops before inference"))
    monkeypatch.setattr(rembg_service, "read_image", lambda path: __import__("numpy").zeros((4, 4, 3), "uint8"))
    monkeypatch.setitem(__import__("sys").modules, "rembg", object())

    with pytest.raises(pytest.skip.Exception):
        rembg_service.remove(ctx, {"path": "a.png", "model": "isnet"})
    assert fetched == ["isnet-general-use"]


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

    with pytest.raises(AppError, match="errors.downloadCorrupted"):
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
    pinned += [model.sha256 for model in deps.REMBG_MODELS.values()]
    for model in whisper_models.MODELS.values():
        assert set(model.sha256) == set(model.files), model.id
        pinned += model.sha256.values()
    assert all(len(h) == 64 and int(h, 16) >= 0 for h in pinned)


def _fake_zip_download(members):
    def download(ctx, url, target_path, expected_sha256, status_key, progress_start, progress_span):
        import zipfile

        with zipfile.ZipFile(target_path, "w") as zf:
            for name in members:
                zf.writestr(name, b"exe")
    return download


@pytest.mark.parametrize(
    "dep_id, members, expected",
    [
        ("ffmpeg", ["ffmpeg-9/bin/ffmpeg.exe", "ffmpeg-9/bin/ffprobe.exe", "ffmpeg-9/doc/readme.txt"], {"ffmpeg.exe", "ffprobe.exe"}),
        ("gifsicle", ["gifsicle-1.95/gifsicle.exe", "gifsicle-1.95/gifdiff.exe"], {"gifsicle.exe"}),
    ],
)
def test_portable_zip_install_copies_only_the_executables(monkeypatch, tmp_path, ctx, dep_id, members, expected):
    monkeypatch.setattr(deps_installer, "app_data_dir", lambda: tmp_path / "data")
    monkeypatch.setattr(deps_installer, "cache_dir", lambda: tmp_path)
    monkeypatch.setattr(deps_installer, "ensure_app_paths", lambda: None)
    monkeypatch.setattr(deps_installer.shutil, "which", lambda name: None)
    monkeypatch.setattr(deps_installer, "_download_file_with_progress", _fake_zip_download(members))

    assert deps_installer.install_dependency(ctx, dep_id) == {"id": dep_id, "ok": True}
    assert {p.name for p in (tmp_path / "data" / "bin").iterdir()} == expected
    assert not (tmp_path / f"{dep_id}.zip").exists()
    assert ctx.of("job:progress")[-1]["percent"] == 100


def test_portable_zip_without_the_executable_fails(monkeypatch, tmp_path, ctx):
    monkeypatch.setattr(deps_installer, "app_data_dir", lambda: tmp_path / "data")
    monkeypatch.setattr(deps_installer, "cache_dir", lambda: tmp_path)
    monkeypatch.setattr(deps_installer, "ensure_app_paths", lambda: None)
    monkeypatch.setattr(deps_installer.shutil, "which", lambda name: None)
    monkeypatch.setattr(deps_installer, "_download_file_with_progress", _fake_zip_download(["readme.txt"]))

    with pytest.raises(AppError, match="gifsicle.exe"):
        deps_installer.install_gifsicle(ctx)
    assert not (tmp_path / "gifsicle.zip").exists()


def test_ffmpeg_without_ffprobe_is_not_ready(monkeypatch):
    monkeypatch.setattr(deps, "ensure_app_paths", lambda custom=None: None)
    monkeypatch.setattr(deps.shutil, "which", lambda name: "C:/tools/ffmpeg.exe" if name == "ffmpeg" else None)
    ffmpeg = next(d for d in deps.check_dependencies() if d["id"] == "ffmpeg")
    assert ffmpeg["ok"] is False and ffmpeg["installable"] is True
    assert ffmpeg["detail"] == "settings.deps.detailFfprobeMissing"


def test_ffmpeg_install_runs_when_only_ffprobe_is_missing(monkeypatch, tmp_path, ctx):
    monkeypatch.setattr(deps_installer, "app_data_dir", lambda: tmp_path / "data")
    monkeypatch.setattr(deps_installer, "cache_dir", lambda: tmp_path)
    monkeypatch.setattr(deps_installer, "ensure_app_paths", lambda: None)
    monkeypatch.setattr(deps_installer.shutil, "which", lambda name: "C:/tools/ffmpeg.exe" if name == "ffmpeg" else None)
    monkeypatch.setattr(deps_installer, "_download_file_with_progress", _fake_zip_download(["bin/ffmpeg.exe", "bin/ffprobe.exe"]))

    deps_installer.install_ffmpeg(ctx)
    assert {p.name for p in (tmp_path / "data" / "bin").iterdir()} == {"ffmpeg.exe", "ffprobe.exe"}
