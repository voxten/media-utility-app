import pytest

from backend.core.jobs import JobContext
from backend.services import download, instagram


def _image(width, url="https://cdn.example/img.jpg"):
    return {"url": f"{url}?w={width}", "width": width, "height": width}


def test_slide_prefers_largest_video_and_small_thumbnail():
    slide = instagram._slide({
        "original_width": 1080,
        "original_height": 1350,
        "video_duration": 12.5,
        "video_versions": [{"url": "https://cdn.example/v1.mp4"}, {"url": "https://cdn.example/v2.mp4"}],
        "image_versions2": {"candidates": [_image(1080), _image(640), _image(480), _image(150)]},
    })
    assert slide == {
        "kind": "video",
        "url": "https://cdn.example/v1.mp4",
        "width": 1080,
        "height": 1350,
        "duration": 12.5,
        "thumbnail": "https://cdn.example/img.jpg?w=480",
    }


def test_slide_photo_uses_largest_candidate():
    slide = instagram._slide({"image_versions2": {"candidates": [_image(320), _image(1440), _image(640)]}})
    assert slide["kind"] == "image"
    assert slide["url"].endswith("w=1440")
    assert slide["thumbnail"].endswith("w=640")


def test_carousel_keeps_photos_and_videos_in_order():
    ie = instagram.InstagramPostIE()
    product = {
        "pk": "1",
        "user": {"username": "someone"},
        "carousel_media": [
            {"image_versions2": {"candidates": [_image(1080)]}},
            {"video_versions": [{"url": "https://cdn.example/v.mp4"}], "image_versions2": {"candidates": [_image(1080)]}},
            {"image_versions2": {"candidates": []}},
        ],
    }
    info = ie._extract_product(product, video_id="ABC123")
    assert info["_type"] == "playlist"
    assert info["shortcode"] == "ABC123"
    assert [s["kind"] for s in info[instagram.INSTAGRAM_MEDIA_KEY]] == ["image", "video"]


def test_single_photo_post_is_not_rejected():
    ie = instagram.InstagramPostIE()
    info = ie._extract_product({"pk": "1", "user": {"username": "u"}, "image_versions2": {"candidates": [_image(1080)]}}, "X1")
    assert info["_type"] == "playlist"
    assert len(info[instagram.INSTAGRAM_MEDIA_KEY]) == 1


def test_stem_skips_missing_parts():
    assert instagram._stem("some.user", "ABC") == "some.user_ABC"
    assert instagram._stem(None, "story", "123") == "story_123"
    assert instagram._stem(None, None) == "instagram"


@pytest.mark.parametrize(
    ("url", "kind", "parts"),
    [
        ("https://www.instagram.com/missmiafit/p/DfIJt1ejOpq/", "post", {}),
        ("https://www.instagram.com/p/DfIJt1ejOpq/?img_index=2", "post", {}),
        ("https://www.instagram.com/reel/Chunk8-jurw/", "post", {}),
        ("https://www.instagram.com/stories/gradek_justyna/4023129286629737444/", "stories", {"user": "gradek_justyna", "id": "4023129286629737444"}),
        ("https://www.instagram.com/stories/gradek_justyna/", "stories", {"user": "gradek_justyna", "id": None}),
        ("https://www.instagram.com/stories/highlights/18090946048123978/", "highlight", {"id": "18090946048123978"}),
        ("https://www.instagram.com/gradek_justyna/", "profile", {"user": "gradek_justyna"}),
        ("https://www.instagram.com/gradek_justyna?igsh=abc", "profile", {"user": "gradek_justyna"}),
        ("https://www.instagram.com/gradek_justyna/reels/", "profile", {"user": "gradek_justyna"}),
    ],
)
def test_parse_url(url, kind, parts):
    assert instagram.parse_url(url) == (kind, parts)


@pytest.mark.parametrize(
    "url",
    [
        "https://www.instagram.com/explore/",
        "https://www.instagram.com/stories/highlights/",
        "https://www.instagram.com/accounts/login/",
        "https://www.youtube.com/watch?v=x",
    ],
)
def test_parse_url_rejects_other_links(url):
    with pytest.raises(RuntimeError, match="instagram.error.notSupported"):
        instagram.parse_url(url)


def test_item_marks_carousels():
    entry = {"stem": "u_A", "slides": [instagram._slide({"image_versions2": {"candidates": [_image(1080)]}})] * 3}
    item = instagram._item(4, entry, None)
    assert (item["index"], item["kind"], item["count"], item["selected"]) == (4, "carousel", 3, True)


def test_stories_and_profiles_need_cookies():
    with pytest.raises(RuntimeError, match="instagram.error.loginRequired"):
        instagram._feed_extractor("https://www.instagram.com/stories/someone/", None)


def test_login_errors_map_to_cookie_hint():
    err = instagram._wrap_errors(JobContext(), RuntimeError("ERROR: [Instagram] X: This content isn't available to everyone"))
    assert str(err) == "instagram.error.loginRequired"


def test_rate_limit_is_reported():
    err = instagram._wrap_errors(JobContext(), RuntimeError("x: Unable to download JSON metadata: HTTP Error 429: Too Many Requests"))
    assert str(err) == "instagram.error.rateLimited"


def test_instagram_cookie_file_is_used(tmp_path):
    cookie = tmp_path / "ig.txt"
    cookie.write_text("# Netscape HTTP Cookie File\n")
    assert download.cookie_file_for("https://www.instagram.com/p/X/", {"instagram": str(cookie)}) == str(cookie)


class _FakeFeed:
    def __init__(self, total):
        self.total = total
        self.fetched = 0

    def posts(self):
        for n in range(self.total):
            self.fetched += 1
            yield {"code": f"C{n}", "image_versions2": {"candidates": [_image(1080)]}}


def test_stopping_a_profile_keeps_loaded_posts(monkeypatch):
    feed = _FakeFeed(30)
    monkeypatch.setattr(instagram, "_feed_extractor", lambda url, cookie_file: feed)
    monkeypatch.setattr(instagram, "_thumbnail", lambda url: None)
    ctx = JobContext("probe-1")
    partials = []
    monkeypatch.setattr(ctx, "partial", partials.append)
    original = instagram._slides

    def slides_then_stop(parser, media):
        if media["code"] == "C4":
            instagram.stop_listing(ctx.job_id)
        return original(parser, media)

    monkeypatch.setattr(instagram, "_slides", slides_then_stop)
    url = "https://www.instagram.com/someone/"
    result = instagram.probe(ctx, url, {})

    assert [it["index"] for it in result["items"]] == [0, 1, 2, 3, 4]
    assert len(partials) == 5
    assert feed.fetched == 5
    assert len(instagram._listings[url][1]["entries"]) == 5
    assert ctx.job_id not in instagram._stop_requests
