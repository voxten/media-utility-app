from pathlib import Path

import pytest
from PIL import Image

from backend.core import imaging
from backend.core.ffmpeg import run_ffmpeg, same_file
from backend.core.paths import unique_path


def test_unique_path_skips_existing_and_reserved_names(tmp_path: Path):
    target = tmp_path / "a.png"
    assert unique_path(target) == target
    target.write_bytes(b"x")
    assert unique_path(target) == tmp_path / "a (1).png"

    taken: set = set()
    first = unique_path(tmp_path / "b.png", taken)
    second = unique_path(tmp_path / "b.png", taken)
    assert (first.name, second.name) == ("b.png", "b (1).png")


def test_unique_path_handles_polish_names(tmp_path: Path):
    folder = tmp_path / "Zdjęcia ąęł"
    folder.mkdir()
    target = folder / "żółć.jpg"
    target.write_bytes(b"x")
    assert unique_path(target).name == "żółć (1).jpg"


@pytest.mark.parametrize("fmt, expected", [("JPG", "JPEG"), (".tif", "TIFF"), ("webp", "WEBP")])
def test_pil_format_names(fmt, expected):
    assert imaging.pil_format(fmt) == expected


def test_prepare_for_format_flattens_onto_white_only_without_alpha_support():
    clear = Image.new("RGBA", (2, 2), (0, 0, 0, 0))
    assert imaging.prepare_for_format(clear, "jpeg").getpixel((0, 0)) == (255, 255, 255)
    assert imaging.prepare_for_format(clear, "png").mode == "RGBA"
    assert imaging.prepare_for_format(Image.new("L", (2, 2)), "bmp").mode == "RGB"


def test_same_file_ignores_case_and_relative_parts(tmp_path: Path):
    path = tmp_path / "Video.mp4"
    assert same_file(path, tmp_path / "x" / ".." / "Video.mp4")
    assert not same_file(path, tmp_path / "other.mp4")


def test_run_ffmpeg_refuses_to_overwrite_its_input(tmp_path: Path, ctx):
    src = tmp_path / "clip.mp4"
    src.write_bytes(b"original")
    with pytest.raises(ValueError, match="common.outputIsInput"):
        run_ffmpeg(ctx, ["-i", str(src), "-c", "copy", str(src)], duration=1.0, out_path=src)
    assert src.read_bytes() == b"original"
