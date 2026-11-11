import pytest

from backend.core import clipboard


@pytest.mark.parametrize(
    "text, target",
    [
        ("https://www.youtube.com/watch?v=abc", "download"),
        ("https://youtu.be/abc", "download"),
        ("https://m.youtube.com/shorts/abc", "download"),
        ("https://vm.tiktok.com/ZM123/", "download"),
        ("https://x.com/user/status/1", "download"),
        ("https://twitter.com/user/status/1", "download"),
        ("https://www.instagram.com/p/xyz/", "instagram"),
    ],
)
def test_supported_links(text, target):
    assert clipboard.find_link(text) == {"url": text, "target": target}


def test_link_inside_text_without_trailing_punctuation():
    text = "zobacz to (https://youtu.be/abc), serio."
    assert clipboard.find_link(text) == {"url": "https://youtu.be/abc", "target": "download"}


def test_several_video_links_go_to_the_queue_together():
    text = "https://youtu.be/a\nhttps://www.instagram.com/p/x/\nhttps://x.com/u/status/1 https://youtu.be/a"
    assert clipboard.find_link(text) == {
        "url": "https://youtu.be/a",
        "target": "download",
        "urls": ["https://youtu.be/a", "https://x.com/u/status/1"],
    }


def test_first_supported_link_wins():
    text = "https://example.com/a https://www.instagram.com/reel/1/ https://youtu.be/b"
    assert clipboard.find_link(text)["target"] == "instagram"


@pytest.mark.parametrize(
    "text",
    ["", "just words", "https://example.com/watch?v=1", "https://notyoutube.com/x", "youtube.com/watch?v=1", "ftp://x.com/a"],
)
def test_unsupported_text(text):
    assert clipboard.find_link(text) is None


def test_read_text_never_raises():
    assert isinstance(clipboard.read_text(), str)
