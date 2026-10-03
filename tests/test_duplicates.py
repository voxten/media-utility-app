import csv

import numpy as np
from PIL import Image, ImageDraw

from backend.services import duplicates
from backend.services.duplicates import MediaItem, group_similar


def _pattern(seed: int, size=(256, 256)) -> Image.Image:
    rng = np.random.default_rng(seed)
    img = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(img)
    for _ in range(25):
        x0, y0 = rng.integers(0, size[0] - 40, 2)
        w, h = rng.integers(10, 60, 2)
        draw.rectangle([int(x0), int(y0), int(x0 + w), int(y0 + h)], fill=tuple(int(c) for c in rng.integers(0, 255, 3)))
    return img


def test_image_scan_groups_resized_copies(tmp_path, ctx):
    original = _pattern(1)
    original.save(tmp_path / "photo.png")
    original.resize((128, 128)).save(tmp_path / "photo_small.jpg", quality=85)
    sub = tmp_path / "nested"
    sub.mkdir()
    original.save(sub / "photo_copy.webp")
    _pattern(2).save(tmp_path / "other.png")
    (tmp_path / "broken.png").write_bytes(b"nope")

    result = duplicates.scan(ctx, str(tmp_path), "image")

    assert result["scanned"] == 4 and result["failed"] == 1
    assert len(result["groups"]) == 1
    names = sorted(item["filename"] for item in result["groups"][0])
    assert names == ["photo.png", "photo_copy.webp", "photo_small.jpg"]
    assert all(item["thumb"].startswith("data:image/jpeg") for item in result["groups"][0])


def test_video_duration_tolerance_blocks_grouping():
    from imagehash import hex_to_hash

    h = [hex_to_hash("ffff0000ffff0000")] * 5
    a = MediaItem(path="a.mp4", size=1, width=1, height=1, hashes=h, duration=10_000)
    b = MediaItem(path="b.mp4", size=1, width=1, height=1, hashes=h, duration=10_500)
    c = MediaItem(path="c.mp4", size=1, width=1, height=1, hashes=h, duration=20_000)
    groups = group_similar([a, b, c])
    assert [[i.path for i in g] for g in groups] == [["a.mp4", "b.mp4"]]


def test_grouping_is_transitive():
    from imagehash import hex_to_hash

    base = hex_to_hash("0000000000000000")
    mid = hex_to_hash("00000000000003ff")  # 10 bits from base
    far = hex_to_hash("00000000000fffff")  # 10 bits from mid, 20 from base
    items = [MediaItem(path=p, size=1, width=1, height=1, hashes=[h]) for p, h in (("a", base), ("b", mid), ("c", far))]
    groups = group_similar(items)
    assert len(groups) == 1 and len(groups[0]) == 3


def test_export_csv(tmp_path):
    groups = [[{"filename": "a.png", "path": "/x/a.png", "width": 1, "height": 2, "duration": None, "size": 10}]]
    out = tmp_path / "report.csv"
    duplicates.export_csv(groups, str(out))
    with open(out, encoding="utf-8") as f:
        rows = list(csv.reader(f))
    assert rows[0][0] == "Group"
    assert rows[1] == ["1", "a.png", "1x2", "", "10", "/x/a.png"]


def test_empty_folder(tmp_path, ctx):
    assert duplicates.scan(ctx, str(tmp_path), "video")["groups"] == []
