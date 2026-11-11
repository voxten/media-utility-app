import subprocess
from pathlib import Path

import pytest
from PIL import Image

from backend.core import ffmpeg
from backend.core.jobs import JobCancelled
from backend.services import gif_editor, gif_render, video_to_gif

needs_gifsicle = pytest.mark.skipif(not gif_render.gifsicle_available(), reason="gifsicle not installed")


def _sample_video(path: Path, duration: int = 2) -> Path:
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", f"testsrc=duration={duration}:size=320x240:rate=25",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return path


def _sample_gif(path: Path, frames: int = 10, size=(120, 80), duration: int = 100) -> Path:
    images = [Image.new("RGB", size, (i * 25 % 256, 80, 255 - i * 20 % 256)) for i in range(frames)]
    images[0].save(path, save_all=True, append_images=images[1:], duration=duration, loop=0)
    return path


def _durations(path: Path):
    with Image.open(path) as img:
        result = []
        for i in range(img.n_frames):
            img.seek(i)
            result.append(img.info.get("duration"))
        return img.size, result


@pytest.mark.parametrize("fmt", ["gif", "webp", "apng"])
def test_video_to_animation(tmp_path, ctx, fmt):
    vid = _sample_video(tmp_path / "clip.mp4")
    out = tmp_path / f"out{gif_render.EXTENSIONS[fmt]}"

    res = video_to_gif.render(ctx, {
        "path": str(vid), "outPath": str(out), "start": 0.5, "end": 1.5, "fps": 10, "width": 160,
        "output": {"format": fmt},
    })

    assert out.is_file()
    assert (res["width"], res["height"]) == (160, 120)
    assert 9 <= res["frames"] <= 11
    assert res["duration"] == pytest.approx(1.0)
    assert any(p["percent"] and p["percent"] > 0 for p in ctx.of("job:progress"))


def test_video_to_gif_speed_and_crop(tmp_path, ctx):
    vid = _sample_video(tmp_path / "clip.mp4")
    out = tmp_path / "fast.gif"

    res = video_to_gif.render(ctx, {
        "path": str(vid), "outPath": str(out), "start": 0, "end": 2, "fps": 10, "speed": 2,
        "crop": {"x": 0, "y": 0, "width": 200, "height": 100}, "output": {"format": "gif", "colors": 64},
    })

    assert res["duration"] == pytest.approx(1.0)
    assert (res["width"], res["height"]) == (200, 100)
    # The cropped corner repeats between some frames, which gifsicle merges into one longer frame.
    size, durations = _durations(out)
    assert size == (200, 100)
    assert len(durations) == res["frames"] <= 11
    assert sum(durations) == pytest.approx(1000, abs=100)


def test_video_preview_estimates_full_size(tmp_path):
    vid = _sample_video(tmp_path / "clip.mp4", duration=8)

    res = video_to_gif.preview(str(vid), {"start": 0, "end": 8, "fps": 8, "width": 120, "output": {"format": "gif"}})

    assert res["dataUrl"].startswith("data:image/gif;base64,")
    assert res["previewSeconds"] == pytest.approx(video_to_gif.PREVIEW_SECONDS)
    assert res["estimatedSize"] > res["size"]


def test_editor_load(tmp_path):
    gif = _sample_gif(tmp_path / "a.gif")

    info = gif_editor.load(str(gif))

    assert (info["width"], info["height"], info["frames"]) == (120, 80, 10)
    assert info["duration"] == pytest.approx(1.0)
    assert info["plays"] == 0
    assert info["dataUrl"].startswith("data:image/gif;base64,")


def test_editor_operations(tmp_path, ctx):
    gif = _sample_gif(tmp_path / "a.gif")
    out = tmp_path / "edited.gif"

    res = gif_editor.render(ctx, {
        "path": str(gif), "outPath": str(out), "output": {"format": "gif", "plays": 3},
        "operations": {
            "trim": {"start": 0.2, "end": 0.7},
            "crop": {"x": 10, "y": 10, "width": 100, "height": 60},
            "resize": {"percent": 50},
            "speed": 2,
            "reverse": True,
        },
    })

    size, durations = _durations(out)
    assert size == (50, 30)
    assert len(durations) == 5
    assert all(d == 50 for d in durations)
    assert res["processed"] == 1
    with Image.open(out) as img:
        assert img.info.get("loop") == 2


def test_editor_boomerang_and_formats(tmp_path, ctx):
    gif = _sample_gif(tmp_path / "a.gif", frames=5)
    images, durations = gif_editor.apply(*gif_editor._decode(str(gif)), {"boomerang": True})
    assert len(images) == 8

    for fmt in ("webp", "apng", "mp4"):
        out = tmp_path / f"out{gif_render.EXTENSIONS[fmt]}"
        gif_editor.render(ctx, {"path": str(gif), "outPath": str(out), "output": {"format": fmt}})
        assert out.stat().st_size > 0
    assert ffmpeg.probe_media(str(tmp_path / "out.mp4"))["videoCodec"] == "h264"


def test_editor_batch(tmp_path, ctx):
    a, b = _sample_gif(tmp_path / "a.gif"), _sample_gif(tmp_path / "b.gif", frames=4)
    out_dir = tmp_path / "out"

    res = gif_editor.render(ctx, {
        "files": [str(a), str(b)], "outputDir": str(out_dir), "output": {"format": "gif"},
        "operations": {str(b): {"rotate": 90}},
    })

    assert res["processed"] == 2
    assert len(ctx.of("job:partial")) == 2
    assert _durations(out_dir / "b.gif")[0] == (80, 120)


def test_editor_preview_downscales(tmp_path):
    gif = _sample_gif(tmp_path / "big.gif", frames=3, size=(900, 600))

    res = gif_editor.preview(str(gif), {}, {"format": "gif"})

    assert (res["width"], res["height"]) == (900, 600)
    assert res["dataUrl"].startswith("data:image/webp;base64,")


@needs_gifsicle
def test_fit_gif_under_target(tmp_path, ctx):
    vid = _sample_video(tmp_path / "clip.mp4", duration=3)
    out = tmp_path / "fit.gif"

    res = video_to_gif.render(ctx, {
        "path": str(vid), "outPath": str(out), "fps": 15,
        "output": {"format": "gif", "targetBytes": 150_000},
    })

    assert res["fit"]["reached"]
    assert out.stat().st_size <= 150_000


@needs_gifsicle
def test_lossy_shrinks_gif(tmp_path, ctx):
    vid = _sample_video(tmp_path / "clip.mp4")
    plain, lossy = tmp_path / "plain.gif", tmp_path / "lossy.gif"
    base = {"path": str(vid), "fps": 15}

    video_to_gif.render(ctx, {**base, "outPath": str(plain), "output": {"format": "gif"}})
    video_to_gif.render(ctx, {**base, "outPath": str(lossy), "output": {"format": "gif", "lossy": 120}})

    assert lossy.stat().st_size < plain.stat().st_size


def test_run_ffmpeg_cancel_removes_output(tmp_path, ctx):
    out = tmp_path / "cancelled.mp4"
    ctx.cancel()

    with pytest.raises(JobCancelled):
        ffmpeg.run_ffmpeg(ctx, ["-f", "lavfi", "-i", "testsrc=duration=60:size=640x480", "-c:v", "libx264", str(out)],
                          60, out_path=out)
    assert not out.exists()


def test_video_to_gif_keeps_an_existing_file(tmp_path, ctx):
    vid = _sample_video(tmp_path / "clip.mp4", duration=1)
    existing = tmp_path / "clip.gif"
    existing.write_bytes(b"old")
    res = video_to_gif.render(ctx, {"path": str(vid), "outPath": str(existing), "start": 0, "end": 0.4, "fps": 5,
                                    "width": 80, "output": {"format": "gif"}})
    assert Path(res["outPath"]).name == "clip (1).gif"
    assert existing.read_bytes() == b"old"
