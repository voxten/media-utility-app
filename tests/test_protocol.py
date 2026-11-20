import pytest

from backend.core import protocol

YOUTUBE = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
ENCODED = "https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DjNQXAC9IVRw"


@pytest.mark.parametrize(
    "uri",
    [
        f"mediastudio://open?url={ENCODED}",
        f"MediaStudio://open/?url={ENCODED}",
    ],
)
def test_encoded_https_link_is_accepted(uri):
    assert protocol.parse_link(uri) == YOUTUBE


def test_plus_and_ampersand_survive_encoding():
    assert protocol.parse_link("mediastudio://open?url=http%3A%2F%2Fa.com%2F%3Fq%3Da%2Bb%26c%3D1") == "http://a.com/?q=a+b&c=1"


@pytest.mark.parametrize(
    "uri",
    [
        "mediastudio://open?url=file%3A%2F%2F%2FC%3A%2FWindows%2Fwin.ini",
        "mediastudio://open?url=javascript%3Aalert(1)",
        "mediastudio://open?url=ftp%3A%2F%2Fa.com%2Fx",
        "mediastudio://open?url=https%3A%2F%2F",
        "mediastudio://open?url=",
        "mediastudio://open",
        f"mediastudio://run?url={ENCODED}",
        f"mediastudio://open/extra?url={ENCODED}",
        f"mediastudio://open?url={ENCODED}&url={ENCODED}",
        f"https://open?url={ENCODED}",
        "mediastudio://open?url=https%3A%2F%2Fa.com%2F%0Aevil",
        "mediastudio://open?url=https%3A%2F%2Fa.com%2Fa%20b",
        "mediastudio://open?url=https%3A%2F%2Fa.com%2F%00",
        "mediastudio://open?url=https%3A%2F%2F" + "a" * protocol.MAX_URL + ".com",
        "",
    ],
)
def test_other_links_are_rejected(uri):
    assert protocol.parse_link(uri) is None


def test_only_the_first_argument_is_a_link():
    link = f"mediastudio://open?url={ENCODED}"
    assert protocol.link_from_argv(["MediaStudio.exe", link]) == link
    assert protocol.link_from_argv(["MediaStudio.exe", "MEDIASTUDIO:x"]) == "MEDIASTUDIO:x"
    assert protocol.link_from_argv(["MediaStudio.exe", "--dev", link]) is None
    assert protocol.link_from_argv(["MediaStudio.exe", "C:\a.mp4"]) is None
    assert protocol.link_from_argv(["MediaStudio.exe"]) is None
