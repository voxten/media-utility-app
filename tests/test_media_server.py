import urllib.error
import urllib.request

import numpy as np
import pytest

from backend.core import media_server
from tests.conftest import served


def _get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status, dict(resp.headers), resp.read()


def test_a_registered_file_is_served_whole_or_in_ranges(tmp_path):
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(bytes(range(100)))
    url = media_server.file_url(clip)

    status, headers, body = _get(url)
    assert (status, body, headers["Content-Type"]) == (200, bytes(range(100)), "video/mp4")
    assert headers["Access-Control-Allow-Origin"] == "*"

    status, headers, body = _get(url, {"Range": "bytes=10-19"})
    assert (status, body, headers["Content-Range"]) == (206, bytes(range(10, 20)), "bytes 10-19/100")
    assert _get(url, {"Range": "bytes=-5"})[2] == bytes(range(95, 100))
    assert media_server.file_url(clip).split("?")[0] == url.split("?")[0]


def test_only_registered_files_with_the_token_are_served(tmp_path):
    secret = tmp_path / "secret.txt"
    secret.write_text("no")
    url = media_server.file_url(tmp_path / "public.png")
    base, _, rest = url.partition("127.0.0.1:")
    port = rest.split("/")[0]

    for wrong in (
        url.replace(url.split("/")[3], "wrong-token"),
        f"http://127.0.0.1:{port}/{url.split('/')[3]}/unknown/secret.txt",
    ):
        with pytest.raises(urllib.error.HTTPError) as err:
            _get(wrong)
        assert err.value.code == 404


def test_a_new_preview_replaces_the_previous_file_of_its_slot(tmp_path):
    first, second = tmp_path / "a.webp", tmp_path / "b.webp"
    first.write_bytes(b"first")
    second.write_bytes(b"second")

    old_url = media_server.slot_url("test.preview", first)
    new_url = media_server.slot_url("test.preview", second)

    assert not first.exists()
    assert served(new_url) == b"second"
    with pytest.raises(urllib.error.HTTPError):
        _get(old_url)


def test_photos_the_window_cannot_show_become_a_png_preview(tmp_path, monkeypatch):
    from backend.core import paths

    monkeypatch.setattr(paths, "cache_dir", lambda: tmp_path)
    rgb = np.zeros((4, 6, 3), np.uint8)
    jpg = tmp_path / "photo.jpg"
    jpg.write_bytes(b"jpeg bytes")

    assert served(media_server.image_url(jpg, rgb, "test.image")) == b"jpeg bytes"
    assert served(media_server.image_url(tmp_path / "scan.tiff", rgb, "test.image"))[1:4] == b"PNG"
