import codecs
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
    assert out.read_bytes().startswith(codecs.BOM_UTF8)
    with open(out, encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    assert rows[0][0] == "Group"
    assert rows[1] == ["1", "a.png", "1x2", "", "10", "/x/a.png"]


def test_empty_folder(tmp_path, ctx):
    assert duplicates.scan(ctx, str(tmp_path), "video")["groups"] == []


def test_phash_matches_imagehash_reference():
    import imagehash

    rng = np.random.default_rng(7)
    images = [_pattern(seed) for seed in range(5)]
    images += [Image.fromarray(rng.integers(0, 255, (h, w, 3), dtype=np.uint8)) for h, w in ((50, 80), (300, 200), (33, 33))]
    for img in images:
        assert duplicates.phash(img) == imagehash.phash(img)


def test_grouping_ten_thousand_photos_takes_seconds_and_can_be_cancelled(ctx):
    import time

    import pytest
    from imagehash import ImageHash

    from backend.core.jobs import JobCancelled

    rng = np.random.default_rng(3)
    items = [
        MediaItem(path=str(n), size=1, width=1, height=1, hashes=[ImageHash(rng.integers(0, 2, (8, 8)).astype(bool))])
        for n in range(10_000)
    ]
    items[9_999].hashes = items[0].hashes
    started = time.monotonic()
    groups = group_similar(items)
    assert time.monotonic() - started < 30
    assert ["0", "9999"] in [[i.path for i in g] for g in groups]

    ctx.cancel()
    with pytest.raises(JobCancelled):
        group_similar(items, ctx=ctx)


def test_videos_with_fewer_frames_compare_on_the_frames_both_have():
    from imagehash import hex_to_hash

    same = [hex_to_hash("ffff0000ffff0000")] * 3
    a = MediaItem(path="a.mp4", size=1, width=1, height=1, hashes=same + [hex_to_hash("0" * 16)] * 2, duration=5_000)
    b = MediaItem(path="b.mp4", size=1, width=1, height=1, hashes=same, duration=5_200)
    assert [[i.path for i in g] for g in group_similar([a, b])] == [["a.mp4", "b.mp4"]]


def test_numpy_grouping_matches_comparing_every_pair():
    from imagehash import ImageHash

    rng = np.random.default_rng(5)
    base = rng.integers(0, 2, (8, 8)).astype(bool)
    items = []
    for n in range(200):
        noisy = base ^ (rng.random((8, 8)) < 0.12)
        items.append(MediaItem(path=str(n), size=1, width=1, height=1, hashes=[ImageHash(noisy)]))

    parent = list(range(len(items)))

    def root(i):
        while parent[i] != i:
            i = parent[i]
        return i

    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if items[i].hashes[0] - items[j].hashes[0] <= duplicates.HASH_THRESHOLD:
                parent[root(j)] = root(i)
    expected = {}
    for i in range(len(items)):
        expected.setdefault(root(i), []).append(str(i))
    expected_groups = sorted(sorted(g) for g in expected.values() if len(g) > 1)

    assert sorted(sorted(i.path for i in g) for g in group_similar(items)) == expected_groups


def test_trash_reports_progress_and_keeps_going_after_a_failure(tmp_path, ctx, monkeypatch):
    moved = []

    def fake_trash(path):
        if path.endswith("missing.png"):
            raise FileNotFoundError(path)
        moved.append(path)

    monkeypatch.setattr(duplicates.system, "move_to_trash", fake_trash)
    paths = [str(tmp_path / "a.png"), str(tmp_path / "missing.png"), str(tmp_path / "b.png")]
    result = duplicates.trash(ctx, paths)
    assert result["removed"] == [paths[0], paths[2]] == moved
    assert result["failed"] == 1
    assert result["errors"] == [{"path": paths[1], "error": "errors.pathMissing"}]
    assert ctx.of("job:progress")[-1]["percent"] == 100


def test_cancelled_trash_returns_what_was_already_moved(tmp_path, ctx, monkeypatch):
    def fake_trash(path):
        ctx.cancel()

    monkeypatch.setattr(duplicates.system, "move_to_trash", fake_trash)
    paths = [str(tmp_path / f"{i}.png") for i in range(3)]
    assert duplicates.trash(ctx, paths)["removed"] == paths[:1]
