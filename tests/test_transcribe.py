import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.core import whisper_models
from backend.core.jobs import JobCancelled
from backend.services import deps_installer, transcribe
from backend.services.transcribe import Cue, Word


def _words(*items):
    return [Word(start, end, text) for start, end, text in items]


def test_timestamps():
    assert transcribe._timestamp(0, ",") == "00:00:00,000"
    assert transcribe._timestamp(62.3456, ",") == "00:01:02,346"
    assert transcribe._timestamp(3725.5, ".") == "01:02:05.500"
    assert transcribe._timestamp(-1, ",") == "00:00:00,000"


def test_wrap_balances_two_lines():
    text = "To jest dość długie zdanie, które nie zmieści się w jednej linii napisów"
    lines = transcribe._wrap(text)
    assert len(lines) == 2
    assert " ".join(lines) == text
    assert all(len(line) <= transcribe.MAX_LINE_CHARS for line in lines)
    assert abs(len(lines[0]) - len(lines[1])) < 12
    assert transcribe._wrap("Krótko.") == ["Krótko."]


def test_cues_split_on_sentence_end():
    cues = transcribe.build_cues(_words(
        (0.0, 0.5, " Dzień"), (0.5, 1.2, " dobry."), (1.4, 1.8, " To"), (1.8, 2.2, " test."),
    ))
    assert [c.text for c in cues] == ["Dzień dobry.", "To test."]
    # The 0.2 s gap is closed so the first cue does not flicker off.
    assert cues[0].end == cues[1].start == 1.4
    # The last one is too short to read and is stretched to a second.
    assert cues[1].end == pytest.approx(2.4)


def test_short_cue_never_overlaps_the_next():
    fast = _words(*[(i * 0.05, i * 0.05 + 0.05, "abcdefghij") for i in range(10)])
    cues = transcribe.build_cues(fast)
    assert len(cues) == 2
    assert cues[0].end == cues[1].start


def test_cues_split_on_pause_and_length():
    paused = transcribe.build_cues(_words((0.0, 0.4, "raz"), (0.4, 0.8, "dwa"), (3.0, 3.4, "trzy")))
    assert [c.text for c in paused] == ["raz dwa", "trzy"]

    many = _words(*[(i * 0.3, i * 0.3 + 0.3, "słowo") for i in range(40)])
    cues = transcribe.build_cues(many)
    assert len(cues) > 1
    for cue in cues:
        assert len(cue.text) <= transcribe.MAX_LINE_CHARS * transcribe.MAX_CUE_LINES
        assert cue.end - cue.start <= transcribe.MAX_CUE_SECONDS + 0.5
    assert sum(c.text.count("słowo") for c in cues) == 40


def test_srt_vtt_txt():
    segments = [Cue(0.0, 1.2, "Dzień dobry."), Cue(2.0, 3.0, "Drugi fragment.")]
    words = _words((0.0, 0.5, " Dzień"), (0.5, 1.2, " dobry."), (2.0, 2.5, " Drugi"), (2.5, 3.0, " fragment."))
    assert transcribe.render("srt", segments, words) == (
        "1\n00:00:00,000 --> 00:00:01,200\nDzień dobry.\n\n"
        "2\n00:00:02,000 --> 00:00:03,000\nDrugi fragment.\n"
    )
    vtt = transcribe.render("vtt", segments, words)
    assert vtt.startswith("WEBVTT\n\n00:00:00.000 --> 00:00:01.200\nDzień dobry.\n")
    assert transcribe.render("txt", segments, words) == "Dzień dobry.\nDrugi fragment.\n"


def test_srt_is_written_with_bom(tmp_path):
    out = transcribe.write_output("srt", str(tmp_path / "a.srt"), [Cue(0, 1, "Żółw.")], _words((0, 1, "Żółw.")))
    assert out.read_bytes().startswith(b"\xef\xbb\xbf")
    assert "Żółw." in out.read_text(encoding="utf-8-sig")


def test_model_registry(monkeypatch, tmp_path):
    monkeypatch.setattr(whisper_models, "app_data_dir", lambda: tmp_path)
    assert whisper_models.model_for_dep("whisper_small").id == "small"
    assert whisper_models.model_for_dep("whisper_nope") is None
    assert whisper_models.model_for_dep("rembg") is None
    assert "/resolve/536b0662" in whisper_models.file_url(whisper_models.MODELS["small"], "model.bin")
    assert whisper_models.size_label(483_546_902) == "~484 MB"
    assert whisper_models.size_label(1_617_884_929) == "~1.6 GB"

    fake = whisper_models.WhisperModel("fake", "org/fake", "abc", {"model.bin": 10, "config.json": 2})
    monkeypatch.setitem(whisper_models.MODELS, "fake", fake)
    folder = whisper_models.model_dir("fake")
    folder.mkdir(parents=True)
    (folder / "model.bin").write_bytes(b"0" * 10)
    assert not whisper_models.is_model_downloaded("fake")
    (folder / "config.json").write_bytes(b"{}x")
    assert not whisper_models.is_model_downloaded("fake")  # wrong size
    (folder / "config.json").write_bytes(b"{}")
    assert whisper_models.is_model_downloaded("fake")


def test_install_whisper_downloads_missing_files(monkeypatch, tmp_path, ctx):
    monkeypatch.setattr(whisper_models, "app_data_dir", lambda: tmp_path)
    fake = whisper_models.WhisperModel("fake", "org/fake", "abc", {"config.json": 2, "model.bin": 8})
    monkeypatch.setitem(whisper_models.MODELS, "fake", fake)
    monkeypatch.setattr(whisper_models, "is_engine_installed", lambda: True)
    monkeypatch.setattr(transcribe, "verify_model", lambda model_id: None)
    downloaded = []

    def fake_download(ctx, url, target_path, **kwargs):
        downloaded.append(url)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(b"0" * fake.files[target_path.name])
        return target_path

    monkeypatch.setattr(deps_installer, "_download_file_with_progress", fake_download)
    folder = whisper_models.model_dir("fake")
    folder.mkdir(parents=True)
    (folder / "config.json").write_bytes(b"{}")

    assert deps_installer.install_dependency(ctx, "whisper_fake") == {"id": "whisper_fake", "ok": True}
    assert downloaded == ["https://huggingface.co/org/fake/resolve/abc/model.bin"]
    assert whisper_models.is_ready("fake")


def _speech_like_audio(path: Path, seconds: int = 3) -> Path:
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", f"sine=frequency=300:duration={seconds}", str(path)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return path


class _FakeModel:
    def __init__(self, segments, on_segment=None):
        self.segments = segments
        self.on_segment = on_segment
        self.kwargs = None
        self.samples = 0

    def transcribe(self, audio, **kwargs):
        self.kwargs = kwargs
        self.samples = len(audio)

        def generate():
            for seg in self.segments:
                if self.on_segment:
                    self.on_segment(seg)
                yield seg

        return generate(), SimpleNamespace(language="pl")


def _segment(start, end, text):
    words = [SimpleNamespace(start=start, end=end, word=f" {text}")]
    return SimpleNamespace(start=start, end=end, text=f" {text}", words=words)


def test_run_writes_subtitles(monkeypatch, tmp_path, ctx):
    audio = _speech_like_audio(tmp_path / "talk.wav")
    model = _FakeModel([_segment(0.0, 1.2, "Dzień dobry."), _segment(1.5, 3.0, "Do widzenia.")])
    monkeypatch.setattr(whisper_models, "is_ready", lambda model_id: True)
    monkeypatch.setattr(transcribe, "load_model", lambda model_id: model)

    out = tmp_path / "talk.srt"
    result = transcribe.run(ctx, {"path": str(audio), "model": "small", "format": "srt", "outPath": str(out), "translate": True})

    assert model.samples == pytest.approx(3 * transcribe.SAMPLE_RATE, rel=0.01)
    assert model.kwargs["task"] == "translate"
    assert model.kwargs["word_timestamps"] and model.kwargs["vad_filter"]
    assert model.kwargs["language"] is None
    assert result["language"] == "pl"
    assert [s["text"] for s in result["segments"]] == ["Dzień dobry.", "Do widzenia."]
    assert "00:00:01,500 --> 00:00:03,000\nDo widzenia." in out.read_text(encoding="utf-8-sig")
    percents = [e["percent"] for e in ctx.of("job:progress") if e.get("percent") is not None]
    assert percents == sorted(percents)
    assert percents[-1] == 100


def test_turbo_never_translates(monkeypatch, tmp_path, ctx):
    audio = _speech_like_audio(tmp_path / "talk.wav", seconds=1)
    model = _FakeModel([_segment(0.0, 1.0, "Hej.")])
    monkeypatch.setattr(whisper_models, "is_ready", lambda model_id: True)
    monkeypatch.setattr(transcribe, "load_model", lambda model_id: model)
    transcribe.run(ctx, {"path": str(audio), "model": "turbo", "format": "txt", "outPath": str(tmp_path / "a.txt"), "translate": True})
    assert model.kwargs["task"] == "transcribe"


def test_cancel_stops_between_segments(monkeypatch, tmp_path, ctx):
    audio = _speech_like_audio(tmp_path / "talk.wav")
    model = _FakeModel(
        [_segment(0.0, 1.0, "Raz."), _segment(1.0, 2.0, "Dwa."), _segment(2.0, 3.0, "Trzy.")],
        on_segment=lambda seg: seg.text == " Dwa." and ctx.cancel(),
    )
    monkeypatch.setattr(whisper_models, "is_ready", lambda model_id: True)
    monkeypatch.setattr(transcribe, "load_model", lambda model_id: model)
    out = tmp_path / "talk.srt"
    with pytest.raises(JobCancelled):
        transcribe.run(ctx, {"path": str(audio), "model": "small", "format": "srt", "outPath": str(out)})
    assert not out.exists()


def test_missing_model_is_reported(monkeypatch, tmp_path, ctx):
    monkeypatch.setattr(whisper_models, "is_ready", lambda model_id: False)
    with pytest.raises(RuntimeError, match="not installed"):
        transcribe.run(ctx, {"path": str(tmp_path / "x.wav"), "model": "small", "outPath": str(tmp_path / "x.srt")})
