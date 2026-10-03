"""Unit tests for rembg_service (alpha halo cleaning, despeckling, preview/saving)."""

import numpy as np
import cv2
import pytest
from pathlib import Path
from PIL import Image

from backend.services import rembg_service
from backend.core.jobs import JobContext


def test_rembg_availability_check(monkeypatch):
    assert isinstance(rembg_service.is_available(), bool)


def test_clean_alpha_halos_choke():
    # 20x20 test image with a white square in center
    alpha = np.zeros((20, 20), dtype=np.uint8)
    alpha[5:15, 5:15] = 255
    bgr = np.full((20, 20, 3), 200, dtype=np.uint8)

    _, eroded_alpha = rembg_service.clean_alpha_halos(bgr, alpha, choke_px=1, debleed=False)
    # The 10x10 area should be eroded by 1 pixel on each side -> 8x8
    assert np.count_nonzero(eroded_alpha) < np.count_nonzero(alpha)
    assert eroded_alpha[5, 5] == 0  # Corner should now be 0


def test_clean_alpha_halos_debleed():
    # Solid blue foreground with white edge halo
    bgr = np.full((30, 30, 3), 255, dtype=np.uint8)  # Background is white
    bgr[10:20, 10:20] = [255, 0, 0]  # Solid blue foreground

    alpha = np.zeros((30, 30), dtype=np.uint8)
    alpha[10:20, 10:20] = 255  # solid
    alpha[9:10, 9:21] = 128  # semi-transparent border with white bleed
    alpha[20:21, 9:21] = 128

    cleaned_bgr, _ = rembg_service.clean_alpha_halos(bgr, alpha, choke_px=0, debleed=True)
    # The semi-transparent edge should now be colored with foreground blue rather than pure white
    edge_pixel_b = cleaned_bgr[9, 15, 0]  # Blue channel
    assert edge_pixel_b > 200


def test_filter_small_components_despeckle():
    alpha = np.zeros((100, 100), dtype=np.uint8)
    # Large main subject
    alpha[20:80, 20:80] = 255
    # Small floating noise specks (area 4 px)
    alpha[5:7, 5:7] = 255
    alpha[90:92, 90:92] = 255

    filtered = rembg_service.filter_small_components(alpha, min_area_ratio=0.01, fill_holes=False)
    # Specks should be removed
    assert filtered[5, 5] == 0
    assert filtered[90, 90] == 0
    # Main subject must be preserved
    assert filtered[50, 50] == 255


def test_filter_small_components_hole_filling():
    alpha = np.zeros((100, 100), dtype=np.uint8)
    alpha[20:80, 20:80] = 255
    # Small internal hole
    alpha[48:52, 48:52] = 0

    filtered = rembg_service.filter_small_components(alpha, min_area_ratio=0.01, fill_holes=True)
    # Internal hole should be filled
    assert filtered[50, 50] == 255


def test_load_preview_and_save(tmp_path):
    img_path = tmp_path / "test.png"
    Image.new("RGB", (64, 48), color="red").save(img_path)

    preview = rembg_service.load_preview(str(img_path))
    assert preview["width"] == 64
    assert preview["height"] == 48
    assert preview["dataUrl"].startswith("data:image/png;base64,")

    out_path = tmp_path / "saved.png"
    saved = rembg_service.save_result(str(img_path), str(out_path))
    assert Path(saved).is_file()
    assert Path(saved).stat().st_size > 0
