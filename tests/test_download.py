from pathlib import Path

from backend.services import download


def test_sanitize_x_url():
    assert download.sanitize_x_url("https://x.com/u/status/123/video/1") == "https://x.com/u/status/123"
    assert download.sanitize_x_url(" https://twitter.com/u/status/1/video/2 ") == "https://twitter.com/u/status/1"
    yt = "https://youtube.com/watch?v=abc"
    assert download.sanitize_x_url(yt) == yt


def test_fmt_bytes():
    assert download.fmt_bytes(None) == "Unknown Size"
    assert download.fmt_bytes(512) == "512.0 B"
    assert download.fmt_bytes(1536) == "1.5 KB"
    assert download.fmt_bytes(float("inf")) == "Unknown Size"


def test_resolve_format_adds_audio_for_youtube_video_only():
    yt = "https://www.youtube.com/watch?v=x"
    assert download.resolve_format(yt, "137", "video") == "137+bestaudio"
    assert download.resolve_format(yt, download.AUTO_FORMAT_YOUTUBE, "video") == download.AUTO_FORMAT_YOUTUBE
    assert download.resolve_format(yt, "140", "audio") == "140"
    assert download.resolve_format("https://x.com/a", "hls-1", "video") == "hls-1"


def test_classify_formats():
    raw = [
        {"format_id": "137", "ext": "mp4", "height": 1080, "vcodec": "avc1", "acodec": "none", "filesize": 900},
        {"format_id": "137dup", "ext": "mp4", "height": 1080, "vcodec": "avc1", "acodec": "none", "filesize": 900},
        {"format_id": "22", "ext": "mp4", "height": 720, "vcodec": "avc1", "acodec": "mp4a", "filesize": 500},
        {"format_id": "140", "ext": "m4a", "vcodec": "none", "acodec": "mp4a", "filesize": 100},
        {"format_id": "sb0", "ext": "mhtml", "vcodec": "none", "acodec": "none"},
    ]
    result = download.classify_formats("https://youtu.be/x", raw)
    assert [f["id"] for f in result["video"]] == ["bestvideo+bestaudio/best", "137", "22"]
    assert [f["id"] for f in result["audio"]] == ["140"]
    assert [f["id"] for f in result["muxed"]] == ["bestvideo+bestaudio/best", "22"]
    assert result["video"][0]["kind"] == "auto"


def test_cookie_file_only_when_present(tmp_path):
    existing = tmp_path / "yt.txt"
    existing.write_text("# cookies")
    cookies = {"youtube": str(existing), "x": str(tmp_path / "missing.txt")}
    assert download.cookie_file_for("https://youtube.com/watch?v=1", cookies) == str(existing)
    assert download.cookie_file_for("https://x.com/a/status/1", cookies) is None
    assert download.cookie_file_for("https://vimeo.com/1", cookies) is None


def test_output_template(tmp_path):
    tpl = download.output_template(str(tmp_path), "{title} [{id}].{ext}")
    assert tpl == str(Path(tmp_path) / "%(title)s [%(id)s].%(ext)s")
