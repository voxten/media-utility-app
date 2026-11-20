"""Text from images and scans: scaling for the engine, the invisible PDF text layer, clipboard and saving."""

import io
from pathlib import Path
from types import SimpleNamespace

import fitz
import pytest
from PIL import Image, ImageDraw, ImageFont

from backend.core.errors import AppError
from backend.core.jobs import JobCancelled
from backend.services import ocr

# Words the fake engine "sees", as fractions of the image: (text, x, y, w, h).
WORDS = [("zażółć", 0.10, 0.20, 0.30, 0.05), ("jaźń", 0.45, 0.20, 0.20, 0.05)]


class FakeEngine:
    def __init__(self, words=WORDS):
        self.words = words
        self.sizes = []

    def __call__(self, img, language):
        self.sizes.append(img.size)
        w, h = img.size
        words = [
            {"text": text, "x": x * w, "y": y * h, "w": ww * w, "h": hh * h} for text, x, y, ww, hh in self.words
        ]
        text = " ".join(word["text"] for word in words)
        return {"language": language or "pl", "angle": 0.0, "lines": [{"text": text, "words": words}] if words else []}


@pytest.fixture
def engine(monkeypatch):
    fake = FakeEngine()
    monkeypatch.setattr(ocr, "_engine_recognize", fake)
    monkeypatch.setattr(ocr, "max_dimension", lambda: 2000)
    return fake


def _png(size=(1200, 800)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, "white").save(buf, "PNG")
    return buf.getvalue()


def _scan_pdf(path: Path, rotations=(0,), text_pages=()) -> Path:
    doc = fitz.open()
    for index, rotation in enumerate(rotations):
        portrait = rotation in (90, 270)
        page = doc.new_page(width=400 if portrait else 600, height=600 if portrait else 400)
        if index in text_pages:
            page.insert_text((50, 50), "Already searchable")
        else:
            page.insert_image(page.rect, stream=_png(), rotate=rotation)
        page.set_rotation(rotation)
    doc.save(str(path))
    doc.close()
    return path


def _shown_box(page, word):
    return fitz.Rect(word[:4]) * page.rotation_matrix


def test_large_image_is_scaled_down_and_boxes_come_back_in_its_pixels(engine):
    result = ocr.recognize_image(Image.new("RGB", (8000, 4000), "white"), "pl")
    assert engine.sizes == [(2000, 1000)]
    first = result["lines"][0]["words"][0]
    assert first["text"] == "zażółć"
    assert first["x"] == pytest.approx(800)
    assert first["w"] == pytest.approx(2400)
    assert (result["width"], result["height"]) == (8000, 4000)
    assert result["text"] == "zażółć jaźń"


def test_small_image_is_passed_as_is(engine):
    ocr.recognize_image(Image.new("RGBA", (300, 100), (0, 0, 0, 0)))
    assert engine.sizes == [(300, 100)]


def test_exif_orientation_is_applied(engine, tmp_path):
    path = tmp_path / "phone.jpg"
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90° clockwise to show
    Image.new("RGB", (400, 200), "white").save(path, exif=exif)
    ocr.recognize_file(str(path))
    assert engine.sizes == [(200, 400)]


def test_unreadable_image(engine, tmp_path):
    path = tmp_path / "broken.png"
    path.write_bytes(b"not an image")
    with pytest.raises(AppError) as err:
        ocr.recognize_file(str(path))
    assert err.value.key == "errors.imageUnreadable"


def test_images_job_joins_files_and_reports_progress(engine, ctx, tmp_path):
    paths = []
    for name in ("a.png", "b.png"):
        Image.new("RGB", (200, 100), "white").save(tmp_path / name)
        paths.append(str(tmp_path / name))
    result = ocr.images(ctx, {"paths": paths, "language": "pl"})
    assert result["text"] == "zażółć jaźń\n\nzażółć jaźń"
    assert (result["count"], result["lines"], result["language"]) == (2, 2, "pl")
    assert result["charCount"] == len(result["text"])
    messages = [p["params"] for p in ctx.of("job:progress") if p["message"] == "ocr.status.image"]
    assert messages[-1] == {"current": 2, "total": 2}


def test_pdf_gets_an_invisible_text_layer(engine, ctx, tmp_path):
    src = _scan_pdf(tmp_path / "scan.pdf")
    result = ocr.pdf(ctx, {"path": str(src), "language": "pl", "outPath": str(tmp_path / "scan.pdf")})
    out = Path(result["outPath"])
    assert out.name == "scan (1).pdf"
    assert (result["pageCount"], result["recognized"], result["skipped"]) == (1, 1, 0)
    assert result["text"] == "zażółć jaźń"
    with fitz.open(str(out)) as doc:
        page = doc[0]
        assert "zażółć" in page.get_text()
        words = page.get_text("words")
        assert [w[4] for w in words] == ["zażółć", "jaźń"]
        box = _shown_box(page, words[0])
        assert box.x0 == pytest.approx(60, abs=1)
        assert box.x1 == pytest.approx(240, abs=1)
        assert 75 < box.y0 < box.y1 < 105
        spans = [s for block in page.get_text("dict")["blocks"] for line in block.get("lines", []) for s in line["spans"]]
        assert spans and all(s["font"].endswith(ocr.TEXT_FONT_NAME) or "Arial" in s["font"] for s in spans)


def test_pages_with_text_are_skipped(engine, ctx, tmp_path):
    src = _scan_pdf(tmp_path / "mixed.pdf", rotations=(0, 0), text_pages=(0,))
    result = ocr.pdf(ctx, {"path": str(src), "language": "pl", "outPath": str(tmp_path / "out.pdf")})
    assert len(engine.sizes) == 1
    assert (result["recognized"], result["skipped"]) == (1, 1)
    assert result["text"] == "Already searchable\n\nzażółć jaźń"
    with fitz.open(result["outPath"]) as doc:
        assert doc[0].get_text().strip() == "Already searchable"
        assert "jaźń" in doc[1].get_text()


def test_pdf_that_already_has_text_is_not_copied(engine, ctx, tmp_path):
    src = _scan_pdf(tmp_path / "text.pdf", text_pages=(0,))
    result = ocr.pdf(ctx, {"path": str(src), "language": "pl", "outPath": str(tmp_path / "out.pdf")})
    assert engine.sizes == []
    assert result["outPath"] is None
    assert not (tmp_path / "out.pdf").exists()


def test_pdf_without_out_path_only_reads_text(engine, ctx, tmp_path):
    src = _scan_pdf(tmp_path / "scan.pdf")
    result = ocr.pdf(ctx, {"path": str(src), "language": "pl"})
    assert result["text"] == "zażółć jaźń"
    assert result["outPath"] is None
    assert sorted(p.name for p in tmp_path.iterdir()) == ["scan.pdf"]


@pytest.mark.parametrize("rotation", [90, 180, 270])
def test_rotated_page(engine, ctx, tmp_path, rotation):
    src = _scan_pdf(tmp_path / "rotated.pdf", rotations=(rotation,))
    result = ocr.pdf(ctx, {"path": str(src), "language": "pl", "outPath": str(tmp_path / "out.pdf")})
    with fitz.open(result["outPath"]) as doc:
        page = doc[0]
        assert page.rotation == rotation
        words = page.get_text("words")
        assert [w[4] for w in words] == ["zażółć", "jaźń"]
        shown = page.rect
        box = _shown_box(page, words[0])
        assert box.x0 == pytest.approx(shown.width * 0.10, abs=1)
        assert box.x1 == pytest.approx(shown.width * 0.40, abs=1)
        assert shown.height * 0.18 < box.y0 < box.y1 < shown.height * 0.27


def test_pdf_page_is_rendered_at_most_300_dpi(engine, ctx, tmp_path, monkeypatch):
    src = _scan_pdf(tmp_path / "scan.pdf")
    monkeypatch.setattr(ocr, "max_dimension", lambda: 10000)
    ocr.pdf(ctx, {"path": str(src), "language": "pl"})
    assert engine.sizes == [(2500, 1667)]


def test_pdf_cancel_between_pages(engine, ctx, tmp_path, monkeypatch):
    src = _scan_pdf(tmp_path / "scan.pdf", rotations=(0, 0, 0))

    def cancel_after_reading(img, language):
        ctx.cancel()
        return engine(img, language)

    monkeypatch.setattr(ocr, "_engine_recognize", cancel_after_reading)
    with pytest.raises(JobCancelled):
        ocr.pdf(ctx, {"path": str(src), "language": "pl", "outPath": str(tmp_path / "out.pdf")})
    assert len(engine.sizes) == 1
    assert not (tmp_path / "out.pdf").exists()


def _runtime(languages, created=True):
    class Engine:
        available_recognizer_languages = languages

        @staticmethod
        def is_language_supported(lang):
            return lang in languages

        @staticmethod
        def try_create_from_language(lang):
            return SimpleNamespace(lang=lang) if created else None

        @staticmethod
        def try_create_from_user_profile_languages():
            return None

    return {"OcrEngine": Engine, "Language": lambda tag: tag}


def test_no_language_installed():
    with pytest.raises(AppError) as err:
        ocr._create_engine(_runtime([]), "")
    assert err.value.key == "errors.ocrNoLanguage"


def test_language_not_installed():
    with pytest.raises(AppError) as err:
        ocr._create_engine(_runtime(["pl"]), "en")
    assert err.value.key == "errors.ocrNoLanguage"


def test_profile_language_falls_back_to_first_installed():
    assert ocr._create_engine(_runtime(["pl"]), "").lang == "pl"


def test_missing_winrt_is_reported(monkeypatch):
    import builtins

    real_import = builtins.__import__

    def failing(name, *args, **kwargs):
        if name.startswith("winrt"):
            raise ImportError(name)
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", failing)
    with pytest.raises(AppError) as err:
        ocr.languages()
    assert err.value.key == "errors.ocrUnavailable"


def test_clipboard_picture_is_saved_as_png(monkeypatch, tmp_path):
    monkeypatch.setattr(ocr, "cache_dir", lambda: tmp_path)
    monkeypatch.setattr(ocr.ImageGrab, "grabclipboard", lambda: Image.new("RGB", (30, 20), "red"))
    [path] = ocr.clipboard_image()
    assert Path(path).parent == tmp_path / "ocr"
    with Image.open(path) as img:
        assert img.size == (30, 20)


def test_clipboard_files_keep_images_and_pdfs(monkeypatch, tmp_path):
    files = [tmp_path / name for name in ("a.png", "b.pdf", "c.txt")]
    for file in files:
        file.write_bytes(b"x")
    monkeypatch.setattr(ocr.ImageGrab, "grabclipboard", lambda: [str(f) for f in files] + [str(tmp_path / "gone.png")])
    assert ocr.clipboard_image() == [str(files[0]), str(files[1])]


def test_empty_clipboard(monkeypatch):
    monkeypatch.setattr(ocr.ImageGrab, "grabclipboard", lambda: None)
    assert ocr.clipboard_image() == []


def test_save_text_writes_utf8(tmp_path):
    out = ocr.save_text("Zażółć gęślą jaźń", str(tmp_path / "sub" / "text.txt"))
    assert Path(out).read_text(encoding="utf-8") == "Zażółć gęślą jaźń"


def _polish_installed() -> bool:
    try:
        return any(lang["tag"].lower().startswith("pl") for lang in ocr.languages())
    except AppError:
        return False


@pytest.mark.skipif(not _polish_installed(), reason="Windows text recognition with Polish is not installed")
def test_real_windows_engine_reads_polish_letters():
    img = Image.new("RGB", (1000, 160), "white")
    font = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 56)
    ImageDraw.Draw(img).text((20, 40), "Zażółć gęślą jaźń", fill="black", font=font)
    result = ocr.recognize_image(img, "pl")
    assert result["language"].lower().startswith("pl")
    assert result["text"] == "Zażółć gęślą jaźń"
    assert [w["text"] for w in result["lines"][0]["words"]] == ["Zażółć", "gęślą", "jaźń"]
