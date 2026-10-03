from PIL import Image

from backend.services.converter import ConvertOptions, convert, find_source_files


def _make_images(folder, count=3, mode="RGBA", ext="png"):
    paths = []
    for i in range(count):
        p = folder / f"img{i}.{ext}"
        Image.new(mode, (40, 30), (255, 0, 0, 128) if mode == "RGBA" else (255, 0, 0)).save(p)
        paths.append(p)
    return paths


def test_find_source_files_handles_jpeg_alias(tmp_path):
    Image.new("RGB", (5, 5)).save(tmp_path / "a.jpg")
    Image.new("RGB", (5, 5)).save(tmp_path / "b.jpeg")
    Image.new("RGB", (5, 5)).save(tmp_path / "c.png")
    names = [p.name for p in find_source_files(str(tmp_path), "JPEG")]
    assert names == ["a.jpg", "b.jpeg"]


def test_convert_folder_png_to_webp_keeps_alpha(tmp_path, ctx):
    src, out = tmp_path / "in", tmp_path / "out"
    src.mkdir()
    _make_images(src)
    result = convert(ctx, ConvertOptions(input_dir=str(src), in_fmt="PNG", output_dir=str(out), out_fmt="WEBP"))
    assert result["converted"] == 3 and result["failed"] == 0
    files = sorted(out.iterdir())
    assert [f.suffix for f in files] == [".webp"] * 3
    with Image.open(files[0]) as img:
        assert img.mode == "RGBA"
    assert ctx.of("job:progress")[-1]["percent"] == 100
    assert len(ctx.of("job:log")) == 3


def test_convert_rgba_to_jpeg_uses_jpg_extension(tmp_path, ctx):
    files = _make_images(tmp_path, 1)
    out = tmp_path / "out"
    result = convert(ctx, ConvertOptions(files=[str(f) for f in files], output_dir=str(out), out_fmt="JPEG"))
    assert result["converted"] == 1
    assert (out / "img0.jpg").exists()


def test_broken_file_is_logged_and_skipped(tmp_path, ctx):
    _make_images(tmp_path, 1)
    (tmp_path / "broken.png").write_bytes(b"not an image")
    out = tmp_path / "out"
    result = convert(ctx, ConvertOptions(input_dir=str(tmp_path), in_fmt="PNG", output_dir=str(out), out_fmt="BMP"))
    assert result == {**result, "converted": 1, "failed": 1, "total": 2}
    assert any(log["level"] == "error" for log in ctx.of("job:log"))


def test_empty_folder_returns_zero(tmp_path, ctx):
    result = convert(ctx, ConvertOptions(input_dir=str(tmp_path), in_fmt="PNG", output_dir=str(tmp_path / "o"), out_fmt="WEBP"))
    assert result["total"] == 0 and result["converted"] == 0
