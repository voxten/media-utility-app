import fitz
import pytest
from pathlib import Path

from backend.services import pdf


def _make_pdf(path, labels):
    doc = fitz.open()
    for label in labels:
        page = doc.new_page(width=200, height=300)
        page.insert_text((20, 50), label)
    doc.save(str(path))
    doc.close()


def _page_texts(path):
    with fitz.open(str(path)) as doc:
        return [page.get_text().strip() for page in doc]


def test_inspect_streams_every_page(tmp_path, ctx):
    a, b = tmp_path / "a.pdf", tmp_path / "b.pdf"
    _make_pdf(a, ["A1", "A2"])
    _make_pdf(b, ["B1"])
    result = pdf.inspect(ctx, [str(a), str(b)])
    assert [(p["fileName"], p["page"]) for p in result["pages"]] == [("a.pdf", 0), ("a.pdf", 1), ("b.pdf", 0)]
    assert all(p["thumb"].startswith("data:image/jpeg;base64,") for p in result["pages"])
    assert len(ctx.of("job:partial")) == 3


def test_inspect_reports_unreadable_files(tmp_path, ctx):
    bad = tmp_path / "bad.pdf"
    bad.write_bytes(b"garbage")
    result = pdf.inspect(ctx, [str(bad)])
    assert result["pages"] == [] and len(result["errors"]) == 1


def test_merge_respects_custom_order(tmp_path, ctx):
    a, b = tmp_path / "a.pdf", tmp_path / "b.pdf"
    _make_pdf(a, ["A1", "A2"])
    _make_pdf(b, ["B1"])
    out = tmp_path / "out" / "merged.pdf"
    order = [{"file": str(b), "page": 0}, {"file": str(a), "page": 1}, {"file": str(a), "page": 0}]
    result = pdf.merge(ctx, order, str(out))
    assert result["pageCount"] == 3
    assert _page_texts(out) == ["B1", "A2", "A1"]


def test_render_page_preview(tmp_path):
    a = tmp_path / "a.pdf"
    _make_pdf(a, ["A1"])
    assert pdf.render_page(str(a), 0).startswith("data:image/jpeg;base64,")


def test_parse_page_range():
    assert pdf.parse_page_range("1-3, 5, 8-10", 10) == [0, 1, 2, 4, 7, 8, 9]
    assert pdf.parse_page_range("2, 2, 4", 5) == [1, 3]
    assert pdf.parse_page_range("invalid, 99", 5) == []


def test_compress_pdf(tmp_path, ctx):
    src = tmp_path / "doc.pdf"
    _make_pdf(src, ["Page 1", "Page 2"])
    out = tmp_path / "compressed.pdf"
    res = pdf.compress(ctx, str(src), str(out), quality_preset="balanced")
    assert out.is_file()
    assert res["outBytes"] > 0
    assert res["inBytes"] > 0


def test_split_all_and_groups(tmp_path, ctx):
    src = tmp_path / "multipage.pdf"
    _make_pdf(src, ["P1", "P2", "P3", "P4"])
    
    # Test split all
    out_dir_all = tmp_path / "split_all"
    res_all = pdf.split(ctx, str(src), str(out_dir_all), mode="all")
    assert res_all["count"] == 4
    assert len(res_all["files"]) == 4

    # Adjacent groups stay separate files; pages inside a group come out in page order.
    out_dir_groups = tmp_path / "split_groups"
    res_groups = pdf.split(ctx, str(src), str(out_dir_groups), mode="groups", groups=[[0], [2, 1], [3, 99]])
    assert res_groups["count"] == 3
    assert [_page_texts(f) for f in res_groups["files"]] == [["P1"], ["P2", "P3"], ["P4"]]

    with pytest.raises(ValueError):
        pdf.split(ctx, str(src), str(tmp_path / "bad"), mode="range")


def test_pdf_to_images(tmp_path, ctx):
    src = tmp_path / "doc.pdf"
    _make_pdf(src, ["A", "B"])
    out_dir = tmp_path / "images"
    res = pdf.pdf_to_images(ctx, str(src), str(out_dir), fmt="png", dpi=72)
    assert res["count"] == 2
    assert all(f.endswith(".png") for f in res["files"])


def test_pdf_to_images_page_range(tmp_path, ctx):
    src = tmp_path / "doc.pdf"
    _make_pdf(src, ["A", "B", "C"])
    res = pdf.pdf_to_images(ctx, str(src), str(tmp_path / "images"), fmt="png", dpi=72, range_spec="1, 3")
    assert [Path(f).name for f in res["files"]] == ["doc_001.png", "doc_003.png"]


def test_images_to_pdf(tmp_path, ctx):
    from PIL import Image
    img1 = tmp_path / "img1.png"
    img2 = tmp_path / "img2.png"
    Image.new("RGB", (100, 100), "red").save(img1)
    Image.new("RGB", (100, 100), "blue").save(img2)

    out_pdf = tmp_path / "from_images.pdf"
    res = pdf.images_to_pdf(ctx, [str(img1), str(img2)], str(out_pdf))
    assert res["pageCount"] == 2
    assert out_pdf.is_file()


def test_rotate_pages(tmp_path, ctx):
    src = tmp_path / "doc.pdf"
    _make_pdf(src, ["P1", "P2"])
    out = tmp_path / "rotated.pdf"
    res = pdf.rotate_pages(ctx, str(src), [0], 90, str(out))
    assert res["rotatedCount"] == 1
    with fitz.open(str(out)) as doc:
        assert doc[0].rotation == 90
        assert doc[1].rotation == 0


def test_extract_text(tmp_path, ctx):
    src = tmp_path / "doc.pdf"
    _make_pdf(src, ["Hello World", "Second Page Text"])
    out_txt = tmp_path / "extracted.txt"
    res = pdf.extract_text(ctx, str(src), str(out_txt))
    assert out_txt.is_file()
    content = out_txt.read_text(encoding="utf-8")
    assert "Hello World" in content
    assert "Second Page Text" in content


def test_split_names_files_by_page_and_keeps_existing_ones(tmp_path, ctx):
    src = tmp_path / "doc.pdf"
    _make_pdf(src, ["P1", "P2", "P3", "P4", "P5"])
    out = tmp_path / "out"
    res = pdf.split(ctx, str(src), str(out), mode="groups", groups=[[0, 1, 2, 4], [3]])
    assert [Path(f).name for f in res["files"]] == ["doc_1-3,5.pdf", "doc_4.pdf"]

    again = pdf.split(ctx, str(src), str(out), mode="all")
    assert Path(again["files"][0]).name == "doc_001.pdf"
    third = pdf.split(ctx, str(src), str(out), mode="all")
    assert Path(third["files"][0]).name == "doc_001 (1).pdf"
    assert _page_texts(out / "doc_001.pdf") == ["P1"]


def test_pdf_to_images_does_not_overwrite(tmp_path, ctx):
    src = tmp_path / "doc.pdf"
    _make_pdf(src, ["P1"])
    out = tmp_path / "img"
    first = pdf.pdf_to_images(ctx, str(src), str(out), fmt="png", dpi=30)
    second = pdf.pdf_to_images(ctx, str(src), str(out), fmt="png", dpi=30)
    assert first["files"] != second["files"]
    assert len(list(out.iterdir())) == 2


def test_compress_and_rotate_can_replace_the_source(tmp_path, ctx):
    src = tmp_path / "doc.pdf"
    _make_pdf(src, ["P1", "P2"])
    pdf.compress(ctx, str(src), str(src))
    assert _page_texts(src) == ["P1", "P2"]

    res = pdf.rotate_pages(ctx, str(src), [0, 7], 90, str(src))
    assert res["rotatedCount"] == 1
    with fitz.open(str(src)) as doc:
        assert [page.rotation for page in doc] == [90, 0]
    assert sorted(p.name for p in tmp_path.iterdir()) == ["doc.pdf"]


def test_rotate_rejects_angles_that_are_not_right_angles(tmp_path, ctx):
    src = tmp_path / "doc.pdf"
    _make_pdf(src, ["P1"])
    with pytest.raises(ValueError):
        pdf.rotate_pages(ctx, str(src), [0], 45, str(tmp_path / "out.pdf"))


def test_extract_text_page_markers_are_language_neutral(tmp_path, ctx):
    src = tmp_path / "doc.pdf"
    _make_pdf(src, ["Hello"])
    out = tmp_path / "doc.txt"
    pdf.extract_text(ctx, str(src), str(out))
    assert out.read_text(encoding="utf-8").startswith("--- 1 ---")
