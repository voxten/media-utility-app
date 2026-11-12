from pathlib import Path

from PIL import Image

from backend.services import compressor


def _create_test_image(path, size=(300, 300), color="blue"):
    img = Image.new("RGB", size, color)
    img.save(str(path), format="PNG")
    return path


def test_load_preview(tmp_path):
    src = tmp_path / "test.png"
    _create_test_image(src)
    info = compressor.load_preview(str(src))
    assert info["fileName"] == "test.png"
    assert info["width"] == 300
    assert info["height"] == 300
    assert info["dataUrl"].startswith("data:image/")


def test_preview_compress_smart_and_lossless(tmp_path):
    src = tmp_path / "test.png"
    _create_test_image(src)
    
    # Smart WebP compression
    res_webp = compressor.preview_compress(str(src), {"format": "webp", "mode": "smart", "quality": 75})
    assert res_webp["compressedBytes"] > 0
    assert res_webp["dataUrl"].startswith("data:image/webp;base64,")

    # Lossless compression
    res_lossless = compressor.preview_compress(str(src), {"format": "png", "mode": "lossless"})
    assert res_lossless["compressedBytes"] > 0


def test_preview_compress_target_size(tmp_path):
    src = tmp_path / "test.png"
    _create_test_image(src, size=(800, 800))
    res = compressor.preview_compress(str(src), {"format": "jpeg", "mode": "target", "targetKb": 20})
    # Target was 20 KB (~20480 bytes)
    assert res["compressedBytes"] <= 25_000


def test_compress_job_batch(tmp_path, ctx):
    src1 = tmp_path / "img1.png"
    src2 = tmp_path / "img2.png"
    _create_test_image(src1)
    _create_test_image(src2)

    out_dir = tmp_path / "compressed_out"
    res = compressor.compress(ctx, {
        "files": [str(src1), str(src2)],
        "outputDir": str(out_dir),
        "format": "webp",
        "mode": "smart",
        "quality": 80,
    })

    assert res["total"] == 2
    assert res["processed"] == 2
    assert res["savedBytes"] >= 0
    out_files = list(out_dir.glob("*.webp"))
    assert len(out_files) == 2


def test_compress_tif_with_original_format(tmp_path, ctx):
    src = tmp_path / "scan.tif"
    Image.new("RGB", (40, 30), (10, 20, 30)).save(src)
    result = compressor.compress(ctx, {"files": [str(src)], "format": "original", "outputDir": str(tmp_path / "out")})
    assert result["processed"] == 1 and result["failed"] == 0
    assert result["files"][0].endswith("scan_compressed.tif")


def test_compress_keeps_earlier_results(tmp_path, ctx):
    src = tmp_path / "a.png"
    Image.new("RGB", (40, 30), (10, 20, 30)).save(src)
    params = {"files": [str(src)], "format": "png", "outputDir": str(tmp_path / "out")}
    first = compressor.compress(ctx, params)["files"][0]
    second = compressor.compress(ctx, params)["files"][0]
    assert first != second and second.endswith("a_compressed (1).png")


def test_single_file_into_folder_reports_its_path(tmp_path, ctx):
    src = _create_test_image(tmp_path / "photo.png")
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    (out_dir / "photo_compressed.webp").write_bytes(b"old")

    res = compressor.compress(ctx, {"files": [str(src)], "outputDir": str(out_dir), "format": "webp", "mode": "smart"})

    assert res["outPath"] == str(out_dir / "photo_compressed (1).webp")
    assert (out_dir / "photo_compressed.webp").read_bytes() == b"old"


def test_compress_keeps_the_original_when_it_cannot_shrink(tmp_path, ctx):
    src = tmp_path / "small.jpg"
    Image.effect_noise((200, 200), 80).convert("RGB").save(src, quality=10)
    params = {"files": [str(src)], "format": "original", "mode": "smart", "quality": 95, "outputDir": str(tmp_path / "out")}
    res = compressor.compress(ctx, params)

    item = res["results"][0]
    assert item["noGain"] is True
    assert item["outBytes"] == item["inBytes"]
    assert Path(item["dest"]).read_bytes() == src.read_bytes()
    assert [log["message"] for log in ctx.of("job:log")] == ["compressor.log.noGain"]


def test_compress_into_another_format_keeps_its_color_profile(tmp_path, ctx):
    from PIL import ImageCms

    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    src = tmp_path / "photo.png"
    Image.new("RGB", (64, 64), "green").save(src, icc_profile=icc)
    res = compressor.compress(ctx, {"files": [str(src)], "format": "webp", "mode": "smart", "outputDir": str(tmp_path / "out")})

    item = res["results"][0]
    assert item["noGain"] is False
    with Image.open(item["dest"]) as out:
        assert out.info.get("icc_profile") == icc


def test_target_size_without_a_quality_setting_tries_each_size_once(monkeypatch):
    sizes = []
    encode = compressor._compress_to_buffer

    def counting(img, fmt, **kwargs):
        data, mime = encode(img, fmt, **kwargs)
        sizes.append(len(data))
        return data, mime

    monkeypatch.setattr(compressor, "_compress_to_buffer", counting)
    img = Image.effect_noise((300, 300), 90).convert("RGB")
    data, _, reached = compressor._find_target_quality(img, "png", 1024)

    assert reached is False
    assert len(sizes) == 6
    assert len(data) == min(sizes)


def test_target_size_reports_a_reached_target():
    img = Image.effect_noise((300, 300), 90).convert("RGB")
    data, mime, reached = compressor._find_target_quality(img, "jpeg", 40 * 1024)
    assert reached is True and len(data) <= 40 * 1024 and mime == "jpeg"
