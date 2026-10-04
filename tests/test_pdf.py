import fitz

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


def test_split_all_and_range(tmp_path, ctx):
    src = tmp_path / "multipage.pdf"
    _make_pdf(src, ["P1", "P2", "P3", "P4"])
    
    # Test split all
    out_dir_all = tmp_path / "split_all"
    res_all = pdf.split(ctx, str(src), str(out_dir_all), mode="all")
    assert res_all["count"] == 4
    assert len(res_all["files"]) == 4

    # Test split range
    out_dir_range = tmp_path / "split_range"
    res_range = pdf.split(ctx, str(src), str(out_dir_range), mode="range", range_spec="2-3")
    assert res_range["count"] == 1
    assert _page_texts(res_range["files"][0]) == ["P2", "P3"]


def test_pdf_to_images(tmp_path, ctx):
    src = tmp_path / "doc.pdf"
    _make_pdf(src, ["A", "B"])
    out_dir = tmp_path / "images"
    res = pdf.pdf_to_images(ctx, str(src), str(out_dir), fmt="png", dpi=72)
    assert res["count"] == 2
    assert all(f.endswith(".png") for f in res["files"])


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
