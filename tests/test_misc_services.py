import cv2
import numpy as np
import pytest
from PIL import Image

from backend.core import thumbs
from backend.core.settings import Settings
from backend.services import progress_image, tts, watermark


# --- settings -------------------------------------------------------------

def test_settings_defaults_persist_and_deep_merge(tmp_path):
    path = tmp_path / "settings.json"
    s = Settings(path)
    assert s.get("theme") == "system"
    s.update({"theme": "dark", "cookies": {"youtube": "C:/c.txt"}})
    reloaded = Settings(path)
    assert reloaded.get("theme") == "dark"
    assert reloaded.get("cookies") == {"youtube": "C:/c.txt", "x": ""}


def test_settings_recent_folders_dedup(tmp_path):
    s = Settings(tmp_path / "s.json")
    for folder in ["a", "b", "a"]:
        s.add_recent_folder(folder)
    assert s.get("recentFolders") == ["a", "b"]


def test_settings_survive_corrupted_file(tmp_path):
    path = tmp_path / "s.json"
    path.write_text("{not json")
    assert Settings(path).get("language") == "pl"


# --- thumbs ---------------------------------------------------------------

def test_data_url_roundtrip():
    url = thumbs.to_data_url(Image.new("RGBA", (800, 400), (0, 0, 255, 255)), (100, 100), fmt="PNG")
    assert url.startswith("data:image/png;base64,")
    img = Image.open(__import__("io").BytesIO(thumbs.decode_data_url(url)))
    assert img.size == (100, 50)


# --- tts ------------------------------------------------------------------

@pytest.mark.parametrize("raw, expected", [("0", "+0%"), ("10", "+10%"), ("+5", "+5%"), ("-20%", "-20%"), ("", "+0%")])
def test_edge_rate(raw, expected):
    assert tts.edge_rate(raw) == expected


def test_pyttsx3_rate_fallback():
    assert tts.pyttsx3_rate("abc") == 200
    assert tts.pyttsx3_rate("0") == 200
    assert tts.pyttsx3_rate("150") == 150


def test_tts_rejects_empty_text(ctx):
    with pytest.raises(ValueError):
        tts.synthesize(ctx, "   ", "edge", "en-US-GuyNeural", 0, "out.mp3")


# --- watermark ------------------------------------------------------------

def _mask_png(shape, rect):
    mask = np.zeros(shape, dtype=np.uint8)
    x0, y0, x1, y1 = rect
    mask[y0:y1, x0:x1] = 255
    return thumbs.to_data_url(mask, max_size=None, fmt="PNG")


def test_watermark_removes_marked_region(tmp_path, ctx, monkeypatch):
    monkeypatch.setattr(watermark, "cache_dir", lambda: tmp_path)
    img = np.full((60, 80, 3), 120, dtype=np.uint8)
    img[20:30, 30:50] = (0, 0, 255)  # red "watermark"
    src = tmp_path / "zdjęcie.png"  # non-ASCII path on purpose
    watermark.write_image(img, str(src))

    result = watermark.remove(ctx, str(src), _mask_png((60, 80), (28, 18, 52, 32)), "telea")
    out = watermark.read_image(result["resultPath"])
    assert np.abs(out[25, 40].astype(int) - 120).max() < 25
    assert result["notice"] is None

    saved = watermark.save_result(result["resultPath"], str(tmp_path / "final.jpg"))
    assert cv2.imdecode(np.fromfile(saved, np.uint8), cv2.IMREAD_COLOR).shape == (60, 80, 3)


def test_watermark_empty_mask_rejected(tmp_path, ctx):
    src = tmp_path / "a.png"
    watermark.write_image(np.zeros((10, 10, 3), np.uint8), str(src))
    with pytest.raises(ValueError):
        watermark.remove(ctx, str(src), _mask_png((10, 10), (0, 0, 0, 0)), "ns")


def test_watermark_keeps_alpha(tmp_path, ctx, monkeypatch):
    monkeypatch.setattr(watermark, "cache_dir", lambda: tmp_path)
    img = np.full((20, 20, 4), 200, dtype=np.uint8)
    src = tmp_path / "a.png"
    watermark.write_image(img, str(src))
    result = watermark.remove(ctx, str(src), _mask_png((20, 20), (5, 5, 10, 10)), "telea")
    assert watermark.read_image(result["resultPath"]).shape == (20, 20, 4)


# --- progress image -------------------------------------------------------

def test_progress_image_save_png(tmp_path):
    url = thumbs.to_data_url(Image.new("RGB", (10, 10)), None, fmt="PNG")
    result = progress_image.save_png(url, str(tmp_path / "card"))
    assert result["outPath"].endswith("card.png")
    assert Image.open(result["outPath"]).size == (10, 10)


def test_watermark_mask_is_dilated_to_cover_edges(tmp_path, ctx, monkeypatch):
    # A hand-painted mask usually stops just short of the watermark's edge; without
    # dilation those edge pixels bleed back into the inpainted area.
    monkeypatch.setattr(watermark, "cache_dir", lambda: tmp_path)
    img = np.full((240, 320, 3), 140, dtype=np.uint8)
    img[100:130, 120:220] = (220, 40, 40)
    src = tmp_path / "wm.png"
    watermark.write_image(img, str(src))

    result = watermark.remove(ctx, str(src), _mask_png((240, 320), (121, 101, 219, 129)), "telea")
    out = watermark.read_image(result["resultPath"]).astype(int)
    assert np.abs(out[100:130, 120:220] - 140).max() < 20
