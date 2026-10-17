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


def test_resolve_format_adds_audio_for_video_streams():
    yt = "https://www.youtube.com/watch?v=x"
    assert download.resolve_format(yt, "137", "video") == "137+bestaudio/137"
    assert download.resolve_format(yt, download.AUTO_FORMAT_YOUTUBE, "video") == download.AUTO_FORMAT_YOUTUBE
    assert download.resolve_format(yt, "140", "audio") == "140"
    assert download.resolve_format(yt, "", "audio") == "bestaudio/best"
    assert download.resolve_format("https://www.cda.pl/video/123", "dash-0-2", "video") == "dash-0-2+bestaudio/dash-0-2"
    assert download.resolve_format("https://x.com/a", "hls-1", "video") == "hls-1+bestaudio/hls-1"
    assert download.resolve_format("https://www.cda.pl/video/123", "best", "muxed") == download.AUTO_FORMAT


def test_classify_formats():
    raw = [
        {"format_id": "137", "ext": "mp4", "height": 1080, "vcodec": "avc1", "acodec": "none", "filesize": 900},
        {"format_id": "137dup", "ext": "mp4", "height": 1080, "vcodec": "avc1", "acodec": "none", "filesize": 900},
        {"format_id": "22", "ext": "mp4", "height": 720, "vcodec": "avc1", "acodec": "mp4a", "filesize": 500},
        {"format_id": "140", "ext": "m4a", "vcodec": "none", "acodec": "mp4a", "filesize": 100},
        {"format_id": "sb0", "ext": "mhtml", "vcodec": "none", "acodec": "none"},
    ]
    result_yt = download.classify_formats("https://youtu.be/x", raw)
    assert [f["id"] for f in result_yt["video"]] == ["bestvideo+bestaudio/best", "137", "22"]
    assert [f["id"] for f in result_yt["audio"]] == ["140"]
    assert [f["id"] for f in result_yt["muxed"]] == ["bestvideo+bestaudio/best", "22"]
    assert result_yt["video"][0]["kind"] == "auto"

    result_cda = download.classify_formats("https://www.cda.pl/video/123", raw)
    assert [f["id"] for f in result_cda["video"]][0] == "bestvideo+bestaudio/best"
    assert [f["id"] for f in result_cda["muxed"]][0] == "bestvideo+bestaudio/best"


def test_clean_error_message():
    raw = "\x1b[0;31mERROR:\x1b[0m [CDA] 2718156844: Requested format is not available."
    cleaned = download.clean_error_message(raw)
    assert cleaned == "[CDA] 2718156844: Requested format is not available."


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


def test_base_opts_defaults():
    opts = download._base_opts("https://example.com/video", {})
    assert opts["no_color"] is True
    assert opts["overwrites"] is False
    assert opts["continuedl"] is True
    assert opts["retries"] == 5
    assert "http" in opts["retry_sleep_functions"]


def test_expand_batch_urls_single_url():
    urls = ["https://example.com/video1", "https://example.com/video2"]
    # For plain URLs that yt-dlp cannot extract online in offline test environment, it falls back to raw URLs
    items = download.expand_batch_urls(urls)
    assert len(items) == 2
    assert items[0]["url"] == "https://example.com/video1"
    assert items[1]["url"] == "https://example.com/video2"


def test_unique_youtube_dl_no_collision(tmp_path):
    opts = {"outtmpl": str(Path(tmp_path) / "%(title)s.%(ext)s")}
    with download.UniqueYoutubeDL(opts, target_ext="mp4") as ydl:
        info = {"id": "1", "title": "my_video", "ext": "mp4"}
        fn = ydl.prepare_filename(info)
        assert fn == str(Path(tmp_path) / "my_video.mp4")


def test_unique_youtube_dl_collision_adds_counter(tmp_path):
    existing = Path(tmp_path) / "my_video.mp4"
    existing.write_text("existing file")

    opts = {"outtmpl": str(Path(tmp_path) / "%(title)s.%(ext)s")}
    with download.UniqueYoutubeDL(opts, target_ext="mp4") as ydl:
        info = {"id": "2", "title": "my_video", "ext": "mp4"}
        fn = ydl.prepare_filename(info)
        assert fn == str(Path(tmp_path) / "my_video (1).mp4")


def test_unique_youtube_dl_multiple_collisions(tmp_path):
    (Path(tmp_path) / "my_video.mp4").write_text("v0")
    (Path(tmp_path) / "my_video (1).mp4").write_text("v1")

    opts = {"outtmpl": str(Path(tmp_path) / "%(title)s.%(ext)s")}
    with download.UniqueYoutubeDL(opts, target_ext="mp4") as ydl:
        info = {"id": "3", "title": "my_video", "ext": "mp4"}
        fn = ydl.prepare_filename(info)
        assert fn == str(Path(tmp_path) / "my_video (2).mp4")


def test_unique_youtube_dl_audio_conversion(tmp_path):
    (Path(tmp_path) / "song.mp3").write_text("existing audio")

    opts = {"outtmpl": str(Path(tmp_path) / "%(title)s.%(ext)s")}
    with download.UniqueYoutubeDL(opts, target_ext="mp3") as ydl:
        info = {"id": "4", "title": "song", "ext": "m4a"}
        raw_fn = ydl.prepare_filename(info)
        assert raw_fn == str(Path(tmp_path) / "song (1).m4a")

        info["ext"] = "mp3"
        post_fn = ydl.prepare_filename(info)
        assert post_fn == str(Path(tmp_path) / "song (1).mp3")


def test_unique_youtube_dl_temp_and_subsequent_calls_consistent(tmp_path):
    (Path(tmp_path) / "clip.mp4").write_text("existing")

    opts = {"outtmpl": str(Path(tmp_path) / "%(title)s.%(ext)s")}
    with download.UniqueYoutubeDL(opts, target_ext="mp4") as ydl:
        info = {"id": "5", "title": "clip", "ext": "mp4"}
        fn1 = ydl.prepare_filename(info)
        fn_temp = ydl.prepare_filename(info, "temp")
        fn2 = ydl.prepare_filename(info)

        assert fn1 == str(Path(tmp_path) / "clip (1).mp4")
        assert fn_temp == str(Path(tmp_path) / "clip (1).mp4")
        assert fn2 == str(Path(tmp_path) / "clip (1).mp4")


def test_add_to_batch():
    from backend.core.jobs import JobContext

    ctx = JobContext("test-batch")
    partials = []
    ctx.partial = lambda data: partials.append(data)

    queue = download.ActiveBatchQueue(ctx, None)
    with download._active_batches_lock:
        download._active_batches["test-batch"] = queue

    try:
        # Initial add
        queue.add_urls(["https://example.com/1", "https://example.com/2"])
        assert len(queue.items) == 2
        assert queue.items[0]["index"] == 0
        assert queue.items[1]["index"] == 1

        # Dynamic append via add_to_batch
        res = download.add_to_batch("test-batch", ["https://example.com/3", "https://example.com/4"])
        assert res is True
        assert len(queue.items) == 4
        assert queue.items[2]["index"] == 2
        assert queue.items[3]["index"] == 3
        assert len(partials) == 4
    finally:
        with download._active_batches_lock:
            download._active_batches.pop("test-batch", None)

