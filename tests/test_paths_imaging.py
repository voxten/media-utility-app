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


def test_models_move_out_of_the_roaming_folder(tmp_path):
    from backend.core.paths import migrate_models

    old, new = tmp_path / "Roaming" / "models", tmp_path / "Local" / "models"
    (old / "whisper" / "base").mkdir(parents=True)
    (old / "whisper" / "base" / "model.bin").write_bytes(b"w")
    (old / "big-lama.pt").write_bytes(b"lama")
    (new / "whisper" / "small").mkdir(parents=True)
    (new / "whisper" / "small" / "model.bin").write_bytes(b"s")

    migrate_models(old, new)

    assert not old.exists()
    assert (new / "big-lama.pt").read_bytes() == b"lama"
    assert (new / "whisper" / "base" / "model.bin").read_bytes() == b"w"
    assert (new / "whisper" / "small" / "model.bin").read_bytes() == b"s"


def test_a_model_already_in_the_new_place_is_kept(tmp_path):
    from backend.core.paths import migrate_models

    old, new = tmp_path / "old", tmp_path / "new"
    old.mkdir()
    new.mkdir()
    (old / "model.pth").write_bytes(b"old copy")
    (new / "model.pth").write_bytes(b"new copy")

    migrate_models(old, new)

    assert (new / "model.pth").read_bytes() == b"new copy"
    assert (old / "model.pth").exists()  # left for the user; nothing is lost


def test_nothing_happens_without_old_models(tmp_path):
    from backend.core.paths import migrate_models

    migrate_models(tmp_path / "missing", tmp_path / "new")
    assert not (tmp_path / "new").exists()


@pytest.mark.parametrize("orientation", range(1, 9))
def test_read_cv2_turns_photos_upright_like_pillow(tmp_path: Path, orientation: int):
    import numpy as np
    from PIL import ImageOps

    src = Image.new("RGB", (6, 4))
    src.putdata([(x * 40, y * 60, (x + y) * 20) for y in range(4) for x in range(6)])
    exif = Image.Exif()
    exif[0x0112] = orientation
    path = tmp_path / f"turned {orientation}.png"
    src.save(path, exif=exif)

    with Image.open(path) as img:
        expected = np.asarray(ImageOps.exif_transpose(img).convert("RGB"))[:, :, ::-1]
    assert np.array_equal(imaging.read_cv2(path), expected)


def test_read_cv2_brings_16_bit_images_to_8_bits(tmp_path: Path):
    import cv2
    import numpy as np

    deep = np.full((4, 5, 3), 65535, dtype=np.uint16)
    deep[0, 0] = (10 * 256, 0, 0)
    path = tmp_path / "głęboki.png"
    cv2.imencode(".png", deep)[1].tofile(str(path))

    img = imaging.read_cv2(path)
    assert img.dtype == np.uint8 and img.shape == (4, 5, 3)
    assert img[1, 1].tolist() == [255, 255, 255]
    assert img[0, 0].tolist() == [10, 0, 0]


def test_read_cv2_names_an_unreadable_file(tmp_path: Path):
    path = tmp_path / "broken.png"
    path.write_bytes(b"not an image")
    with pytest.raises(ValueError, match="errors.imageUnreadable"):
        imaging.read_cv2(path)


def test_mpo_photos_are_saved_as_jpeg():
    assert imaging.normalize_format("MPO") == "jpeg"
    assert imaging.extension("mpo") == "jpg"
    assert imaging.pil_format("mpo") == "JPEG"


def test_color_profile_goes_only_to_formats_that_store_one():
    from PIL import ImageCms

    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    img = Image.new("RGB", (8, 8), "red")
    img.info["icc_profile"] = icc
    assert imaging.color_profile(img, "jpg") == {"icc_profile": icc}
    assert imaging.color_profile(img, "gif") == {}
    assert imaging.color_profile(Image.new("RGB", (8, 8)), "png") == {}
