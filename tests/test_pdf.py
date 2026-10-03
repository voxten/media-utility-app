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
