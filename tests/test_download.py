from pathlib import Path

from backend.core.jobs import JobCancelled, JobContext
from backend.services import download, download_queue


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


def test_explain_error_asks_for_x_cookies_only_without_them():
    url = "https://x.com/a/status/1"
    err = Exception("ERROR: [twitter] 1: No video could be found in this tweet")
    assert download.explain_error(url, {}, err) == "download.error.xLoginRequired"
    assert download.explain_error(url, {"cookiefile": "x.txt"}, err) == "[twitter] 1: No video could be found in this tweet"
    assert download.explain_error("https://vimeo.com/1", {}, Exception("ERROR: gone")) == "gone"


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
    assert "fragment" in opts["retry_sleep_functions"]
    assert "concurrent_fragment_downloads" not in opts


def test_download_opts_fetch_fragments_in_parallel():
    hook = download._ProgressHook(JobContext())
    opts = download._download_opts("https://x.com/a/status/1", "best", "%(title)s.%(ext)s", "video", "mp3", {}, hook)
    assert opts["concurrent_fragment_downloads"] == download.FRAGMENT_WORKERS > 1


def test_expand_batch_urls_single_url():
    urls = ["https://example.com/video1", "https://example.com/video2"]
    # For plain URLs that yt-dlp cannot extract online in offline test environment, it falls back to raw URLs
    items = download_queue.expand_batch_urls(urls)
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

    queue = download_queue.ActiveBatchQueue(ctx, None)
    with download_queue._active_batches_lock:
        download_queue._active_batches["test-batch"] = queue

    try:
        # Initial add
        queue.add_urls(["https://example.com/1", "https://example.com/2"])
        assert len(queue.items) == 2
        assert queue.items[0]["index"] == 0
        assert queue.items[1]["index"] == 1

        # Dynamic append via add_to_batch
        res = download_queue.add_to_batch("test-batch", ["https://example.com/3", "https://example.com/4"])
        assert res is True
        assert len(queue.items) == 4
        assert queue.items[2]["index"] == 2
        assert queue.items[3]["index"] == 3
        assert len(partials) == 4
    finally:
        with download_queue._active_batches_lock:
            download_queue._active_batches.pop("test-batch", None)



def test_remove_fragment_leftovers_keeps_resume_files(tmp_path):
    part = tmp_path / "clip [1].fhls-954.mp4.part"
    kept = [part, tmp_path / "clip [1].fhls-954.mp4.ytdl", tmp_path / "other.mp4.part-Frag3"]
    removed = [tmp_path / "clip [1].fhls-954.mp4.part-Frag7", tmp_path / "clip [1].fhls-954.mp4.part-Frag8.part"]
    for path in kept + removed:
        path.write_text("x")

    hook = download._ProgressHook(JobContext())
    hook({"status": "downloading", "tmpfilename": str(part)})
    download._remove_fragment_leftovers(hook)

    assert all(p.exists() for p in kept)
    assert not any(p.exists() for p in removed)


def test_close_fragment_streams_releases_part_file(tmp_path):
    part = tmp_path / "clip.mp4.part"

    def interrupted_fragment_download():
        ctx = {"dest_stream": open(part, "wb"), "tmpfilename": str(part)}
        ctx["dest_stream"].write(b"partial")
        raise JobCancelled()

    try:
        interrupted_fragment_download()
    except JobCancelled as exc:
        stream = exc.__traceback__.tb_next.tb_frame.f_locals["ctx"]["dest_stream"]
        download._close_fragment_streams(exc)
        assert stream.closed
    part.rename(tmp_path / "clip.mp4")


class ProgressSink:
    def __init__(self):
        self.events = []

    def __call__(self, event, payload):
        self.events.append((event, payload))

    def progress(self):
        return [p for e, p in self.events if e == "job:progress"]


def test_progress_keeps_rising_across_video_and_audio_streams(monkeypatch):
    sink = ProgressSink()
    ctx = JobContext("j", sink)
    monkeypatch.setattr("backend.core.jobs.PROGRESS_INTERVAL_S", 0)
    hook = download._ProgressHook(ctx)
    video = {"format_id": "137", "vcodec": "avc1", "acodec": "none", "filesize": 900}
    audio = {"format_id": "140", "vcodec": "none", "acodec": "mp4a", "filesize": 100}
    hook.set_info({"requested_formats": [video, audio], "height": 1080, "ext": "mp4", "duration": 60})

    for fmt, size in ((video, 900), (audio, 100)):
        for done in (0, size // 2, size):
            hook({"status": "downloading", "downloaded_bytes": done, "total_bytes": size, "info_dict": fmt})
        hook({"status": "finished", "info_dict": fmt})

    events = sink.progress()
    percents = [p["percent"] for p in events if p["percent"] is not None]
    assert percents == sorted(percents) and percents[-1] == 100
    assert events[0]["message"] == "download.status.downloadingVideo"
    assert events[0]["params"] == {"stream": 1, "streams": 2}
    audio_events = [p for p in events if p["message"] == "download.status.downloadingAudio"]
    assert audio_events and audio_events[-1]["downloaded"] == 1000 and audio_events[-1]["total"] == 1000
    assert [p["message"] for p in events].count("download.status.postprocessing") == 1
    assert ctx.meta == {"height": 1080, "ext": "mp4", "length": 60}


def test_media_summary_takes_the_height_from_the_video_stream():
    info = {"ext": "mp4", "requested_formats": [{"height": 720}, {"height": None}], "uploader": "Someone"}
    assert download.media_summary(info)["height"] == 720
    assert download.media_summary(info)["uploader"] == "Someone"


def test_links_added_after_the_batch_finished_are_refused(monkeypatch, ctx):
    monkeypatch.setattr(download_queue, "expand_batch_urls", lambda urls, cookies=None, ctx=None, report=False: [{"url": u, "title": u} for u in urls])
    queue = download_queue.ActiveBatchQueue(ctx, {})
    assert queue.add_urls(["https://a"]) == 1
    queue.closed = True
    assert queue.add_urls(["https://b"]) is None
    assert [item["url"] for item in queue.items] == ["https://a"]


def test_site_checks_compare_the_host():
    assert download.is_x("https://x.com/u/status/1") and download.is_x("https://mobile.twitter.com/u/status/1")
    assert not download.is_x("https://www.dropbox.com/s/abc") and not download.is_x("https://www.netflix.com/title/1")
    assert download.is_youtube("youtu.be/abc") and download.is_youtube("https://m.youtube.com/watch?v=1")
    assert not download.is_youtube("https://notyoutube.com/watch?v=1")
    assert download.is_instagram("https://www.instagram.com/p/1")
    assert not download.is_instagram("https://example.com/?from=instagram.com")


def test_long_titles_are_shortened_to_fit_windows_paths():
    parent = Path("C:/Users/someone/Downloads")
    assert download.fit_stem(parent, "short", ".mp4") == "short"
    assert len(download.fit_stem(parent, "a" * 400, ".mp4")) == download.MAX_STEM_CHARS
    assert download.fit_stem(parent, "x" * 149 + " ." + "y" * 50, ".mp4") == "x" * 149

    deep = Path("C:/" + "d" * 200)
    stem = download.fit_stem(deep, "b" * 400, ".mp4")
    assert len(str(deep / f"{stem}.mp4")) <= download.MAX_PATH_CHARS


def test_unique_youtube_dl_shortens_a_long_title(tmp_path):
    opts = {"outtmpl": str(Path(tmp_path) / "%(title)s.%(ext)s")}
    with download.UniqueYoutubeDL(opts, target_ext="mp4") as ydl:
        fn = Path(ydl.prepare_filename({"id": "4", "title": "t" * 300, "ext": "webm"}))
    assert fn.suffix == ".webm"
    assert len(fn.stem) <= download.MAX_STEM_CHARS and len(str(fn)) <= download.MAX_PATH_CHARS + 5


def test_browser_cookies_used_only_without_a_cookie_file(tmp_path):
    from backend.services import download as dl

    opts = dl._base_opts("https://www.youtube.com/watch?v=x", {"youtube": None, "browser": "firefox"})
    assert opts["cookiesfrombrowser"] == ("firefox",)
    cookie = tmp_path / "yt.txt"
    cookie.write_text("# Netscape")
    opts = dl._base_opts("https://www.youtube.com/watch?v=x", {"youtube": str(cookie), "browser": "firefox"})
    assert "cookiesfrombrowser" not in opts
    assert "cookiesfrombrowser" not in dl._base_opts("https://a.com/v", {"browser": "netscape"})


def test_browser_cookie_failure_is_explained():
    from backend.services import download as dl

    opts = {"cookiesfrombrowser": ("chrome",)}
    message = dl.explain_error("https://youtu.be/x", opts, Exception("ERROR: Could not copy Chrome cookie database"))
    assert message.startswith("download.error.browserCookies|") and "chrome" in message


def test_sponsorblock_and_section_options():
    from backend.services import download as dl

    opts = dl._download_opts("https://www.youtube.com/watch?v=x", "best", "%(title)s.%(ext)s", "video", "mp3", {},
                             object(), sponsorblock=True, section=(10.0, 20.0))
    keys = [pp["key"] for pp in opts["postprocessors"]]
    assert keys[0] == "SponsorBlock" and "ModifyChapters" in keys
    assert opts["force_keyframes_at_cuts"] and callable(opts["download_ranges"])
    other = dl._download_opts("https://vimeo.com/1", "best", "t", "video", "mp3", {}, object(), sponsorblock=True)
    assert "SponsorBlock" not in [pp["key"] for pp in other["postprocessors"]]


def test_parse_section():
    from backend.services import download as dl

    assert dl.parse_section(None) is None
    assert dl.parse_section({"start": 5, "end": 2}) is None
    assert dl.parse_section({"start": "1.5", "end": 9}) == (1.5, 9.0)
    assert dl.parse_section({"start": "x", "end": 9}) is None
