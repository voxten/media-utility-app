"""Tests for backend.services.image_editor."""

from pathlib import Path
from PIL import Image

from backend.core.jobs import JobContext
from backend.services import image_editor


def _create_test_image(path: Path, size=(200, 100), color=(255, 0, 0), mode="RGB"):
    img = Image.new(mode, size, color)
    img.save(path)
    return path


def test_load_preview(tmp_path: Path):
    src = tmp_path / "test.png"
    _create_test_image(src, size=(300, 200), color=(0, 255, 0))

    meta = image_editor.load_preview(str(src))
    assert meta["width"] == 300
    assert meta["height"] == 200
    assert meta["format"] == "PNG"
    assert meta["dataUrl"].startswith("data:image/")


def test_resize_dimensions(tmp_path: Path):
    src = tmp_path / "img.jpg"
    _create_test_image(src, size=(400, 200))

    out = tmp_path / "resized.jpg"
    res = image_editor.save_transformed(
        str(src),
        str(out),
        {"resize": {"width": 200, "height": 100, "filter": "lanczos"}},
    )
    assert res["width"] == 200
    assert res["height"] == 100
    assert out.is_file()


def test_resize_percent(tmp_path: Path):
    src = tmp_path / "img.png"
    _create_test_image(src, size=(400, 200))

    out = tmp_path / "resized.png"
    res = image_editor.save_transformed(
        str(src),
        str(out),
        {"resize": {"percent": 50, "filter": "bicubic"}},
    )
    assert res["width"] == 200
    assert res["height"] == 100


def test_crop(tmp_path: Path):
    src = tmp_path / "img.png"
    _create_test_image(src, size=(400, 300))

    out = tmp_path / "cropped.png"
    res = image_editor.save_transformed(
        str(src),
        str(out),
        {"crop": {"x": 50, "y": 50, "width": 150, "height": 100}},
    )
    assert res["width"] == 150
    assert res["height"] == 100


def test_rotate_and_flip(tmp_path: Path):
    src = tmp_path / "img.png"
    _create_test_image(src, size=(300, 100))

    out = tmp_path / "transformed.png"
    res = image_editor.save_transformed(
        str(src),
        str(out),
        {"rotate": 90, "flip_h": True},
    )
    assert res["width"] == 100
    assert res["height"] == 300


def test_preview_transform(tmp_path: Path):
    src = tmp_path / "img.png"
    _create_test_image(src, size=(200, 200))

    prev = image_editor.preview_transform(
        str(src),
        {"resize": {"width": 100, "height": 100}, "rotate": 180},
    )
    assert prev["width"] == 100
    assert prev["height"] == 100
    assert prev["dataUrl"].startswith("data:image/")


def test_batch_process(tmp_path: Path):
    src1 = tmp_path / "a.png"
    src2 = tmp_path / "b.png"
    _create_test_image(src1, size=(200, 100))
    _create_test_image(src2, size=(300, 150))

    out_dir = tmp_path / "out"
    logs = []
    ctx = JobContext("test-job", lambda typ, pl: logs.append((typ, pl)))

    result = image_editor.batch_process(
        ctx,
        [str(src1), str(src2)],
        str(out_dir),
        {"resize": {"percent": 50}},
    )

    assert result["total"] == 2
    assert result["processed"] == 2
    assert result["failed"] == 0
    assert len(list(out_dir.glob("*.png"))) == 2


def test_batch_process_per_file_ops(tmp_path: Path):
    src1 = tmp_path / "img1.png"
    src2 = tmp_path / "img2.png"
    _create_test_image(src1, size=(200, 100))
    _create_test_image(src2, size=(200, 100))

    out_dir = tmp_path / "out_per_file"
    logs = []
    ctx = JobContext("test-job", lambda typ, pl: logs.append((typ, pl)))

    # img1 gets rotated 90 deg (new size 100x200), img2 gets flipped and resized to 50x50
    per_file_ops = {
        str(src1): {"rotate": 90},
        str(src2): {"flip_h": True, "resize": {"width": 50, "height": 50}},
    }

    result = image_editor.batch_process(
        ctx,
        [str(src1), str(src2)],
        str(out_dir),
        per_file_ops,
    )

    assert result["total"] == 2
    assert result["processed"] == 2
    assert result["results"][0]["width"] == 100
    assert result["results"][0]["height"] == 200
    assert result["results"][1]["width"] == 50
    assert result["results"][1]["height"] == 50
