"""Tools that write one named file never replace an earlier result."""

import base64
from types import SimpleNamespace

from backend.services import progress_image, tts

PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def test_progress_export_keeps_the_earlier_card(tmp_path):
    data_url = "data:image/png;base64," + base64.b64encode(PNG_1PX).decode()
    first = progress_image.save_png(data_url, str(tmp_path / "postęp.png"))
    second = progress_image.save_png(data_url, str(tmp_path / "postęp.png"))
    assert first["outPath"] == str(tmp_path / "postęp.png")
    assert second["outPath"] == str(tmp_path / "postęp (1).png")


def test_tts_keeps_the_earlier_recording(tmp_path, monkeypatch):
    def fake_edge(ctx, text, voice, rate, out_path):
        out_path.write_bytes(b"ID3")

    monkeypatch.setattr(tts, "_synth_edge", fake_edge)
    ctx = SimpleNamespace(progress=lambda *a, **k: None)
    (tmp_path / "mowa.mp3").write_bytes(b"old")

    result = tts.synthesize(ctx, "Cześć", "edge", "pl-PL-ZofiaNeural", 0, str(tmp_path / "mowa.mp3"))

    assert result["outPath"] == str(tmp_path / "mowa (1).mp3")
    assert (tmp_path / "mowa.mp3").read_bytes() == b"old"
