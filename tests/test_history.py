import json

from backend.core.history import MAX_ENTRIES, JobHistory, result_outputs


def job(job_id="a", kind="converter", status="done", **extra):
    return {
        "id": job_id,
        "kind": kind,
        "title": "WEBP",
        "status": status,
        "startedAt": 1.0,
        "finishedAt": 2.0,
        "error": None,
        **extra,
    }


def test_outputs_from_single_file_results():
    assert result_outputs({"outPath": "C:/out/a.png", "bytes": 3}) == ["C:/out/a.png"]
    assert result_outputs({"title": "Clip", "path": "C:/dl/clip.mp4"}) == ["C:/dl/clip.mp4"]


def test_outputs_from_batches_skip_failed_items_and_duplicates():
    result = {
        "outputDir": "C:/out",
        "files": ["C:/out/a.webp"],
        "items": [
            {"source": "C:/in/a.png", "dest": "C:/out/a.webp"},
            {"index": 1, "status": "error", "path": "C:/out/broken.mp4"},
            {"index": 2, "status": "done", "path": "C:/out/b.mp4"},
        ],
    }
    assert result_outputs(result) == ["C:/out/a.webp", "C:/out/b.mp4"]


def test_outputs_fall_back_to_the_folder():
    assert result_outputs({"outdir": "C:/dl", "items": []}) == ["C:/dl"]
    assert result_outputs({"groups": []}) == []
    assert result_outputs(None) == []
    assert result_outputs("C:/a.png") == []


def test_outputs_leave_out_unsaved_previews(tmp_path):
    cache = tmp_path / "cache"
    preview = cache / "upscale" / "result.png"
    saved = tmp_path / "out" / "photo.png"
    assert result_outputs({"resultPath": str(preview), "path": str(preview)}, cache) == []
    assert result_outputs({"outPath": str(saved)}, cache) == [str(saved)]


def test_record_persists_newest_first(tmp_path):
    path = tmp_path / "history.json"
    history = JobHistory(path)
    history.record(job("a"), {"outPath": "C:/a.png"})
    entry = history.record(job("b", status="error", error="boom"))

    assert entry["id"] == "b" and entry["error"] == "boom" and entry["outputs"] == []
    reloaded = JobHistory(path).entries()
    assert [e["id"] for e in reloaded] == ["b", "a"]
    assert reloaded[1]["outputs"] == ["C:/a.png"]


def test_record_skips_helper_jobs(tmp_path):
    history = JobHistory(tmp_path / "history.json")
    assert history.record(job(kind="download.probe")) is None
    assert history.record(job(kind="download.engines")) is None
    assert history.entries() == []


def test_history_is_capped(tmp_path):
    history = JobHistory(tmp_path / "history.json")
    for i in range(MAX_ENTRIES + 5):
        history.record(job(f"j{i}"))
    entries = history.entries()
    assert len(entries) == MAX_ENTRIES
    assert entries[0]["id"] == f"j{MAX_ENTRIES + 4}"


def test_entries_report_whether_the_output_still_exists(tmp_path):
    kept = tmp_path / "kept.png"
    kept.write_bytes(b"x")
    history = JobHistory(tmp_path / "history.json")
    history.record(job("gone"), {"outPath": str(tmp_path / "gone.png")})
    history.record(job("kept"), {"outPath": str(kept)})
    history.record(job("none"))
    available = {e["id"]: e["available"] for e in history.entries()}
    assert available == {"kept": True, "gone": False, "none": False}


def test_entries_report_a_single_output_file(tmp_path):
    a, b = tmp_path / "a.mp4", tmp_path / "b.mp4"
    a.write_bytes(b"x")
    b.write_bytes(b"x")
    history = JobHistory(tmp_path / "history.json")
    history.record(job("file"), {"path": str(a)})
    history.record(job("many"), {"files": [str(a), str(b)]})
    history.record(job("folder"), {"items": [], "outdir": str(tmp_path)})
    single = {e["id"]: e["singleFile"] for e in history.entries()}
    assert single == {"file": True, "many": False, "folder": False}


def test_damaged_file_starts_empty(tmp_path):
    path = tmp_path / "history.json"
    path.write_text("{not json", encoding="utf-8")
    assert JobHistory(path).entries() == []
    path.write_text(json.dumps([{"no": "id"}, "junk", job("ok")]), encoding="utf-8")
    assert [e["id"] for e in JobHistory(path).entries()] == ["ok"]


def test_clear(tmp_path):
    path = tmp_path / "history.json"
    history = JobHistory(path)
    history.record(job())
    history.clear()
    assert history.entries() == []
    assert JobHistory(path).entries() == []


def test_outputs_read_video_sync_results():
    assert result_outputs({"outputPath": "C:/out/synced.mp4", "bytes": 3}) == ["C:/out/synced.mp4"]


def test_record_keeps_result_numbers_and_a_small_thumbnail(tmp_path):
    history = JobHistory(tmp_path / "history.json")
    result = {"path": "C:/dl/a.mp4", "size": 10, "height": 1080, "ext": "mp4", "title": "x" * 100, "dataUrl": "data:"}
    entry = history.record(job(kind="download", meta={"thumb": "data:image/jpeg;base64,AA", "height": 1080}), result)

    assert entry["stats"] == {"size": 10, "height": 1080, "ext": "mp4"}
    assert entry["meta"] == {"thumb": "data:image/jpeg;base64,AA", "height": 1080}


def test_record_drops_a_large_thumbnail_and_counts_groups(tmp_path):
    history = JobHistory(tmp_path / "history.json")
    big = "data:image/jpeg;base64," + "A" * 20_000
    entry = history.record(job(kind="duplicates.image", meta={"thumb": big}), {"groups": [[], []], "scanned": 9})

    assert entry["meta"] == {}
    assert entry["stats"] == {"groups": 2, "scanned": 9}
