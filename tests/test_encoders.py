import pytest

from backend.core import encoders, ffmpeg


@pytest.fixture
def fake_ffmpeg(tmp_path, monkeypatch):
    """A stand-in FFmpeg binary whose hardware encoders are listed in ``state["compiled"]`` and work if in ``state["working"]``."""
    binary = tmp_path / "ffmpeg.exe"
    binary.write_bytes(b"one")
    cache = tmp_path / "cache"
    cache.mkdir()
    state = {
        "compiled": [f"{c}_{v}" for v in encoders.VENDORS for c in encoders.CODECS],
        "working": set(),
        "probes": [],
        "version": "ffmpeg version 9.0.2",
    }
    monkeypatch.setattr(encoders, "resolve_binary", lambda name: str(binary))
    monkeypatch.setattr(encoders, "cache_dir", lambda: cache)
    monkeypatch.setattr(encoders, "_compiled", lambda ffmpeg: (state["version"], list(state["compiled"])))

    def probe(ffmpeg, name):
        state["probes"].append(name)
        return name in state["working"]

    monkeypatch.setattr(encoders, "probe_encoder", probe)
    monkeypatch.setattr(encoders, "_memory", None)
    state["binary"] = binary
    state["cache"] = cache
    return state


def test_nvenc_comes_before_quick_sync_and_amf(fake_ffmpeg):
    fake_ffmpeg["working"] = {"h264_amf", "hevc_amf", "h264_qsv", "av1_qsv", "h264_nvenc", "hevc_nvenc"}
    assert encoders.hardware_encoder("h264") == "h264_nvenc"
    assert encoders.hardware_encoder("hevc") == "hevc_nvenc"
    assert encoders.hardware_encoder("av1") == "av1_qsv"
    assert encoders.detect()["encoders"] == ["h264_nvenc", "hevc_nvenc", "h264_qsv", "av1_qsv", "h264_amf", "hevc_amf"]
    assert encoders.summary()["devices"] == [
        {"id": "nvenc", "codecs": ["h264", "hevc"]},
        {"id": "qsv", "codecs": ["h264", "av1"]},
        {"id": "amf", "codecs": ["h264", "hevc"]},
    ]


def test_vendor_without_working_h264_is_not_probed_further(fake_ffmpeg):
    fake_ffmpeg["working"] = {"hevc_amf"}
    fake_ffmpeg["compiled"] = ["h264_nvenc", "hevc_nvenc", "h264_amf", "hevc_amf"]
    assert encoders.detect()["encoders"] == []
    assert sorted(fake_ffmpeg["probes"]) == ["h264_amf", "h264_nvenc"]
    assert encoders.hardware_encoder("hevc") is None


def test_result_is_kept_in_memory_and_on_disk(fake_ffmpeg, monkeypatch):
    fake_ffmpeg["working"] = {"h264_nvenc"}
    encoders.detect()
    probes = len(fake_ffmpeg["probes"])
    encoders.detect()
    assert len(fake_ffmpeg["probes"]) == probes
    assert (fake_ffmpeg["cache"] / encoders.CACHE_FILE).is_file()

    monkeypatch.setattr(encoders, "_memory", None)
    assert encoders.detect()["encoders"] == ["h264_nvenc"]
    assert len(fake_ffmpeg["probes"]) == probes


def test_new_ffmpeg_is_checked_again(fake_ffmpeg):
    fake_ffmpeg["working"] = {"h264_nvenc"}
    assert encoders.detect()["encoders"] == ["h264_nvenc"]
    fake_ffmpeg["binary"].write_bytes(b"a newer build")
    fake_ffmpeg["working"] = {"h264_qsv"}
    assert encoders.detect()["encoders"] == ["h264_qsv"]


def test_invalidate_forgets_the_result(fake_ffmpeg):
    fake_ffmpeg["working"] = {"h264_nvenc", "hevc_nvenc"}
    assert encoders.hardware_encoder("hevc") == "hevc_nvenc"
    fake_ffmpeg["working"] = set()
    encoders.invalidate()
    assert not (fake_ffmpeg["cache"] / encoders.CACHE_FILE).exists()
    assert encoders.hardware_encoder("hevc") is None


def test_broken_cache_file_is_ignored(fake_ffmpeg):
    (fake_ffmpeg["cache"] / encoders.CACHE_FILE).write_text("{not json", encoding="utf-8")
    fake_ffmpeg["working"] = {"h264_nvenc"}
    assert encoders.detect()["encoders"] == ["h264_nvenc"]


def test_qsv_and_amf_get_nv12():
    assert encoders.pixel_format("hevc_qsv") == "nv12"
    assert encoders.pixel_format("h264_amf") == "nv12"
    assert encoders.pixel_format("av1_nvenc") == "yuv420p"


@pytest.mark.skipif(not ffmpeg.has_binary("ffmpeg"), reason="ffmpeg not installed")
def test_real_ffmpeg_reports_a_version(tmp_path, monkeypatch):
    monkeypatch.setattr(encoders, "cache_dir", lambda: tmp_path)
    monkeypatch.setattr(encoders, "_memory", None)
    data = encoders.detect()
    assert data["version"].startswith("ffmpeg version")
    assert all(name.split("_")[1] in encoders.VENDORS for name in data["encoders"])
