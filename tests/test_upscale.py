import cv2
import numpy as np
import pytest
import torch

from backend.services import ai_models, upscale


def test_split_alpha_rgb():
    img = np.zeros((30, 40, 3), dtype=np.uint8)
    bgr, alpha = upscale.split_alpha(img)
    assert bgr.shape == (30, 40, 3)
    assert alpha is None


def test_split_alpha_rgba():
    img = np.zeros((30, 40, 4), dtype=np.uint8)
    img[:, :, 3] = 128
    bgr, alpha = upscale.split_alpha(img)
    assert bgr.shape == (30, 40, 3)
    assert alpha is not None
    assert alpha.shape == (30, 40)
    assert np.all(alpha == 128)


def test_anti_halo_debleed():
    # Construct an image where left half is bright red and right half is transparent black (0, 0, 0, 0)
    img = np.zeros((20, 20, 4), dtype=np.uint8)
    img[:, :10, :3] = (0, 0, 255)  # Bright red in BGR
    img[:, :10, 3] = 255           # Opaque
    img[:, 10:, 3] = 0             # Transparent

    bgr, alpha = upscale.split_alpha(img)
    debled = upscale.anti_halo_debleed(bgr, alpha)

    # The visible left side must remain identical
    assert np.all(debled[:, :10] == bgr[:, :10])
    # The transparent right side adjacent to the edge should now contain in-painted edge color, not black
    assert debled[:, 11, 2].mean() > 100


def test_unicode_image_io(tmp_path):
    img = np.full((32, 32, 4), 210, dtype=np.uint8)
    img[:, :, 3] = 180
    dest = tmp_path / "zażółć_gęślą_jaźń.png"

    upscale.write_image(img, str(dest))
    assert dest.is_file()

    loaded = upscale.read_image(str(dest))
    assert loaded.shape == (32, 32, 4)
    assert np.array_equal(loaded, img)

    # Test saving RGBA as JPEG drops alpha channel
    jpg_dest = tmp_path / "converted.jpg"
    upscale.write_image(img, str(jpg_dest))
    assert jpg_dest.is_file()
    loaded_jpg = upscale.read_image(str(jpg_dest))
    assert loaded_jpg.shape == (32, 32, 3)


def test_load_preview(tmp_path):
    img = np.full((50, 60, 4), 100, dtype=np.uint8)
    path = tmp_path / "sample.png"
    upscale.write_image(img, str(path))

    preview = upscale.load_preview(str(path))
    assert preview["width"] == 60
    assert preview["height"] == 50
    assert preview["hasAlpha"] is True
    assert preview["dataUrl"].startswith("data:image/png;base64,")


def test_pytorch_srvggnet_architecture():
    # Real-ESRGAN Compact SRVGGNet (32 conv layers, 4x upsampler)
    model = ai_models.SRVGGNetCompact(num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4, act_type="prelu")
    model.eval()
    dummy = torch.randn(1, 3, 16, 16)
    with torch.no_grad():
        out = model(dummy)
    assert out.shape == (1, 3, 64, 64)


def test_pytorch_rrdbnet_architecture():
    # Real-ESRGAN Anime 6B RRDBNet (6 blocks, 4x upsampler)
    model = ai_models.RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=6, num_grow_ch=32, scale=4)
    model.eval()
    dummy = torch.randn(1, 3, 16, 16)
    with torch.no_grad():
        out = model(dummy)
    assert out.shape == (1, 3, 64, 64)


def test_upscale_array_lanczos_rgba():
    # Tests smooth alpha scaling with Lanczos interpolation
    img = np.zeros((20, 25, 4), dtype=np.uint8)
    img[:, :, :3] = 150
    img[:, :, 3] = 200

    out_4x = upscale.upscale_array(img, model_id="lanczos", scale=4, alpha_mode="smooth", anti_halo=True)
    assert out_4x.shape == (80, 100, 4)

    out_2x = upscale.upscale_array(img, model_id="lanczos", scale=2, alpha_mode="smooth", anti_halo=True)
    assert out_2x.shape == (40, 50, 4)


def test_upscale_job_execution(tmp_path, ctx, monkeypatch):
    monkeypatch.setattr(upscale, "cache_dir", lambda: tmp_path)
    img = np.full((30, 40, 4), 160, dtype=np.uint8)
    img[:, :, 3] = 220
    src = tmp_path / "input.png"
    upscale.write_image(img, str(src))

    result = upscale.upscale(
        ctx,
        str(src),
        model_id="lanczos",
        scale=4,
        alpha_mode="smooth",
        anti_halo=True,
    )

    assert result["width"] == 160
    assert result["height"] == 120
    assert result["hasAlpha"] is True
    assert result["dataUrl"].startswith("data:image/png;base64,")

    saved_target = tmp_path / "output_upscaled.png"
    upscale.save_result(result["resultPath"], str(saved_target))
    assert saved_target.is_file()

    saved_img = upscale.read_image(str(saved_target))
    assert saved_img.shape == (120, 160, 4)
