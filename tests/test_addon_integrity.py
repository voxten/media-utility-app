"""Add-ons whose files went missing count as not installed, and moving an install into place survives
the app being closed half-way."""

import errno
import importlib
import importlib.util
import os
import shutil
import sys
from pathlib import Path
from typing import Dict, Sequence

import pytest

from backend.core import addons, deps, paths
from backend.core.errors import AppError


@pytest.fixture
def frozen(monkeypatch, tmp_path):
    folder = tmp_path / "addons"
    folder.mkdir()
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setenv(addons.ADDONS_DIR_ENV, str(folder))
    monkeypatch.setattr(sys, "path", [*sys.path, str(folder)])
    addons._scan_cache.clear()
    yield folder
    for name in [m for m in sys.modules if m.startswith("demo_ai")]:
        sys.modules.pop(name)
    importlib.invalidate_caches()
    addons._scan_cache.clear()


def make_dist(
    folder: Path,
    project: str,
    version: str,
    files: Dict[str, bytes],
    requires: Sequence[str] = (),
) -> Path:
    """Writes ``files`` and the metadata pip would write for them with ``--target``."""
    for name, data in files.items():
        (folder / name).parent.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(data)
    dist_info = folder / f"{project}-{version}.dist-info"
    dist_info.mkdir(parents=True)
    (dist_info / "METADATA").write_text(
        f"Name: {project}\nVersion: {version}\n" + "".join(f"Requires-Dist: {r}\n" for r in requires),
        encoding="utf-8",
    )
    rows = [f"{name},sha256=x,{len(data)}" for name, data in files.items()]
    rows += [
        f"{dist_info.name}/METADATA,,",
        f"{dist_info.name}/RECORD,,",
        f"../../bin/{project}.exe,sha256=x,10",
        f"{project}/__pycache__/__init__.cpython-314.pyc,,",
    ]
    (dist_info / "RECORD").write_text("\n".join(rows) + "\n", encoding="utf-8")
    importlib.invalidate_caches()
    return dist_info


def ai_package(version: str = "1.0") -> Dict[str, bytes]:
    return {
        "demo_ai/__init__.py": f"VERSION = {version!r}\n".encode(),
        "demo_ai/core.py": b"x = 1\n",
        "demo_ai/lib/engine.dll": b"\0" * 64,
    }


def test_an_intact_addon_is_available(frozen):
    make_dist(frozen, "demo_ai", "1.0", ai_package())
    assert addons.module_available("demo_ai")
    assert not addons.is_damaged("demo_ai")


def test_a_package_whose_files_went_missing_is_not_available(frozen):
    make_dist(frozen, "demo_ai", "1.0", ai_package())
    (frozen / "demo_ai" / "__init__.py").unlink()
    (frozen / "demo_ai" / "core.py").unlink()
    importlib.invalidate_caches()

    # The folder alone still passes for a namespace package; this is what hid a broken PyTorch.
    assert importlib.util.find_spec("demo_ai") is not None
    assert addons.is_damaged("demo_ai")
    assert not addons.module_available("demo_ai")


def test_a_truncated_file_counts_as_damage(frozen):
    make_dist(frozen, "demo_ai", "1.0", ai_package())
    (frozen / "demo_ai" / "lib" / "engine.dll").write_bytes(b"\0" * 10)
    assert addons.is_damaged("demo_ai")


def test_a_damaged_dependency_damages_the_addon_but_an_optional_one_does_not(frozen):
    make_dist(frozen, "demo_ai", "1.0", ai_package(), requires=["demo-ai-dep>=1", 'demo_ai_extra; extra == "gpu"'])
    make_dist(frozen, "demo_ai_extra", "1.0", {"demo_ai_extra/__init__.py": b""})
    (frozen / "demo_ai_extra" / "__init__.py").unlink()
    make_dist(frozen, "demo_ai_dep", "2.0", {"demo_ai_dep/__init__.py": b""})
    assert not addons.is_damaged("demo_ai")

    addons._scan_cache.clear()
    (frozen / "demo_ai_dep" / "__init__.py").unlink()
    assert addons.is_damaged("demo_ai")


def test_metadata_left_by_an_older_version_is_ignored(frozen):
    old = make_dist(frozen, "demo_ai", "0.9", {"demo_ai/__init__.py": b"VERSION = '0.9' and a longer file\n"})
    new = make_dist(frozen, "demo_ai", "1.0", ai_package())
    os.utime(old / "RECORD", ns=(1_000_000_000, 1_000_000_000))
    assert (new / "RECORD").stat().st_mtime_ns > (old / "RECORD").stat().st_mtime_ns
    assert not addons.is_damaged("demo_ai")


def test_metadata_without_a_record_counts_as_damage(frozen):
    dist_info = make_dist(frozen, "demo_ai", "1.0", ai_package())
    (dist_info / "RECORD").unlink()
    assert addons.is_damaged("demo_ai")


def test_running_from_source_never_reports_damage(frozen, monkeypatch):
    make_dist(frozen, "demo_ai", "1.0", ai_package())
    (frozen / "demo_ai" / "core.py").unlink()
    monkeypatch.delattr(sys, "frozen")
    assert not addons.is_damaged("demo_ai")


def test_a_reinstall_is_seen_without_restarting(frozen):
    make_dist(frozen, "demo_ai", "1.0", ai_package())
    (frozen / "demo_ai" / "core.py").unlink()
    assert addons.is_damaged("demo_ai")

    shutil.rmtree(frozen / "demo_ai")
    shutil.rmtree(frozen / "demo_ai-1.0.dist-info")
    make_dist(frozen, "demo_ai", "1.0", ai_package())
    assert not addons.is_damaged("demo_ai")


def test_settings_offer_to_reinstall_a_damaged_pytorch(monkeypatch):
    monkeypatch.setattr(deps, "module_available", lambda name: name != "torch")
    monkeypatch.setattr(deps, "is_damaged", lambda name: name == "torch")
    monkeypatch.setattr(deps, "lama_model_path", lambda: Path("big-lama.pt"))
    items = {item["id"]: item for item in deps.check_dependencies()}
    for dep_id in ("lama", "upscale_general", "upscale_anime"):
        assert not items[dep_id]["ok"]
        assert items[dep_id]["installable"]
        assert items[dep_id]["detail"] == deps.DAMAGED_DETAIL
    assert items["rembg"]["detail"] != deps.DAMAGED_DETAIL


def test_settings_offer_to_reinstall_a_damaged_whisper_engine(monkeypatch):
    monkeypatch.setattr(deps.whisper_models, "module_available", lambda name: name != "ctranslate2")
    monkeypatch.setattr(deps, "is_damaged", lambda name: name == "ctranslate2")
    whisper = [item for item in deps.check_dependencies() if item["id"].startswith("whisper_")]
    assert whisper and all(not w["ok"] and w["installable"] and w["detail"] == deps.DAMAGED_DETAIL for w in whisper)


# Merging a staged install


def staged_upgrade(tmp_path: Path, folder: Path) -> Path:
    make_dist(folder, "demo_ai", "1.0", ai_package("1.0"))
    staged = tmp_path / "addons.staging"
    staged.mkdir()
    make_dist(staged, "demo_ai", "2.0", ai_package("2.0"))
    make_dist(staged, "demo_ai_dep", "1.0", {"demo_ai_dep/__init__.py": b""})
    return staged


def assert_upgraded(folder: Path) -> None:
    names = sorted(p.name for p in folder.iterdir())
    assert names == ["demo_ai", "demo_ai-2.0.dist-info", "demo_ai_dep", "demo_ai_dep-1.0.dist-info"]
    assert (folder / "demo_ai" / "__init__.py").read_text() == "VERSION = '2.0'\n"
    addons._scan_cache.clear()
    assert addons.module_available("demo_ai")
    assert not addons._trash_dir(folder).exists()


def test_metadata_moves_in_after_the_package_files(frozen, tmp_path, monkeypatch):
    staged = staged_upgrade(tmp_path, frozen)
    real_replace, moved_in = os.replace, []

    def recording_replace(src, dst):
        if Path(dst).parent == frozen:
            moved_in.append(Path(dst).name)
        real_replace(src, dst)

    monkeypatch.setattr(addons.os, "replace", recording_replace)
    addons.merge_staged(staged, frozen)

    assert moved_in.index("demo_ai-2.0.dist-info") > moved_in.index("demo_ai")
    assert moved_in.index("demo_ai_dep-1.0.dist-info") > moved_in.index("demo_ai_dep")
    assert not addons.is_merge_pending(staged)
    assert_upgraded(frozen)


@pytest.mark.parametrize("fail_at", range(1, 7))
def test_a_merge_cut_off_at_any_step_is_finished_at_the_next_start(frozen, tmp_path, monkeypatch, fail_at):
    staged = staged_upgrade(tmp_path, frozen)
    assert staged == addons.staging_dir()
    real_replace, calls = os.replace, []

    def closing_replace(src, dst):
        calls.append(dst)
        if len(calls) == fail_at:
            raise KeyboardInterrupt  # the app was closed here
        real_replace(src, dst)

    monkeypatch.setattr(addons.os, "replace", closing_replace)
    with pytest.raises(KeyboardInterrupt):
        addons.merge_staged(staged, frozen)
    monkeypatch.setattr(addons.os, "replace", real_replace)

    assert addons.is_merge_pending(staged)
    addons._scan_cache.clear()
    # Whatever is in place meanwhile is either complete or not there; nothing half-moved looks installed.
    if (frozen / "demo_ai-2.0.dist-info").exists():
        assert (frozen / "demo_ai" / "__init__.py").read_text() == "VERSION = '2.0'\n"
    assert not addons.is_damaged("demo_ai")

    addons.finish_interrupted_install()

    assert not staged.exists()
    assert_upgraded(frozen)


def test_an_install_cut_off_during_pip_is_thrown_away(frozen):
    staged = addons.staging_dir()
    make_dist(staged, "demo_ai", "2.0", {"demo_ai/__init__.py": b""})
    make_dist(frozen, "demo_ai", "1.0", ai_package("1.0"))

    addons.finish_interrupted_install()

    assert not staged.exists()
    assert (frozen / "demo_ai-1.0.dist-info").is_dir()


def test_a_failed_move_keeps_the_staged_install_for_the_next_start(frozen, monkeypatch, ctx):
    from backend.services import deps_installer

    make_dist(frozen, "demo_ai", "1.0", ai_package("1.0"))

    def fake_pip(_ctx, _cmd):
        make_dist(addons.staging_dir(), "demo_ai", "2.0", ai_package("2.0"))

    real_replace = os.replace

    def locked_replace(src, dst):
        if Path(src).parent == addons.staging_dir():
            raise PermissionError(errno.EACCES, "in use", str(dst))
        real_replace(src, dst)

    monkeypatch.setattr(deps_installer, "_pip", fake_pip)
    monkeypatch.setattr(deps_installer, "pip_install_command", lambda *a, **k: [])
    monkeypatch.setattr(addons.os, "replace", locked_replace)
    with pytest.raises(AppError) as raised:
        deps_installer._run_pip(ctx, ["demo_ai"])
    assert raised.value.key == "errors.addonMoveInterrupted"
    assert addons.is_merge_pending(addons.staging_dir())

    monkeypatch.setattr(addons.os, "replace", real_replace)
    addons.finish_interrupted_install()
    assert (frozen / "demo_ai" / "__init__.py").read_text() == "VERSION = '2.0'\n"
    assert not addons.staging_dir().exists()


# Moving folders out of the roaming profile


def cross_drive(monkeypatch, old: Path):
    """os.replace fails like it does between two drives for anything coming from ``old``."""
    real_replace = os.replace

    def replace(src, dst):
        if Path(src).is_relative_to(old):
            raise OSError(errno.EXDEV, "not the same device")
        real_replace(src, dst)

    monkeypatch.setattr(paths.os, "replace", replace)


def test_a_folder_moves_across_drives(tmp_path, monkeypatch):
    old, new = tmp_path / "Roaming" / "addons", tmp_path / "Local" / "addons"
    (old / "cp314" / "torch").mkdir(parents=True)
    (old / "cp314" / "torch" / "__init__.py").write_text("ok")
    cross_drive(monkeypatch, old)

    paths.migrate_folder(old, new)

    assert not old.exists()
    assert (new / "cp314" / "torch" / "__init__.py").read_text() == "ok"
    assert [p.name for p in new.iterdir()] == ["cp314"]


def test_a_copy_across_drives_cut_off_half_way_is_redone(tmp_path, monkeypatch):
    old, new = tmp_path / "Roaming" / "addons", tmp_path / "Local" / "addons"
    package = old / "cp314" / "torch"
    package.mkdir(parents=True)
    for i in range(5):
        (package / f"part{i}.py").write_text(str(i))
    cross_drive(monkeypatch, old)
    real_copytree, copied = shutil.copytree, []

    def closing_copy(src, dst, **kwargs):
        if len(copied) == 2:
            raise KeyboardInterrupt  # the app was closed here
        copied.append(src)
        return shutil.copy2(src, dst, **kwargs)

    def copytree(src, dst, *args, **kwargs):
        if args or kwargs:  # copytree's own call for a subfolder
            return real_copytree(src, dst, *args, **kwargs)
        return real_copytree(src, dst, copy_function=closing_copy)

    monkeypatch.setattr(paths.shutil, "copytree", copytree)
    with pytest.raises(KeyboardInterrupt):
        paths.migrate_folder(old, new)
    monkeypatch.setattr(paths.shutil, "copytree", real_copytree)

    assert not (new / "cp314").exists(), "a half-copied folder never takes the real name"
    assert len(list(package.iterdir())) == 5

    paths.migrate_folder(old, new)

    assert not old.exists()
    assert sorted(p.name for p in new.iterdir()) == ["cp314"]
    assert sorted(p.name for p in (new / "cp314" / "torch").iterdir()) == [f"part{i}.py" for i in range(5)]


def test_folders_several_packages_share_are_merged_not_replaced(frozen, tmp_path):
    (frozen / "bin").mkdir()
    (frozen / "bin" / "hf.exe").write_bytes(b"other add-on")
    (frozen / "bin" / "torchrun.exe").write_bytes(b"old")
    (frozen / "google" / "other_pkg").mkdir(parents=True)
    (frozen / "google" / "other_pkg" / "__init__.py").write_text("")
    (frozen / "google" / "protobuf").mkdir()
    (frozen / "google" / "protobuf" / "stale.py").write_text("")
    staged = tmp_path / "addons.staging"
    make_dist(staged, "protobuf", "7.0", {"google/protobuf/__init__.py": b"", "bin/torchrun.exe": b"new"})

    addons.merge_staged(staged, frozen)

    assert sorted(p.name for p in (frozen / "bin").iterdir()) == ["hf.exe", "torchrun.exe"]
    assert (frozen / "bin" / "torchrun.exe").read_bytes() == b"new"
    assert sorted(p.name for p in (frozen / "google").iterdir()) == ["other_pkg", "protobuf"]
    assert [p.name for p in (frozen / "google" / "protobuf").iterdir()] == ["__init__.py"]


@pytest.mark.parametrize(
    "has_torch, has_model, lama, upscale",
    [
        (False, False, ("settings.deps.detailLamaFull", "~320 MB"), ("settings.deps.detailUpscaleFull", "~129 MB")),
        (False, True, ("settings.deps.detailTorchOnly", "~124 MB"), ("settings.deps.detailTorchOnly", "~124 MB")),
        (True, False, ("settings.deps.detailLamaModelOnly", "~196 MB"), ("settings.deps.detailUpscaleGenMissing", "~4.8 MB")),
    ],
)
def test_the_offered_size_counts_only_what_is_missing(monkeypatch, has_torch, has_model, lama, upscale):
    monkeypatch.setattr(deps, "module_available", lambda name: name == "torch" and has_torch)
    monkeypatch.setattr(deps, "is_damaged", lambda name: False)
    monkeypatch.setattr(deps, "lama_model_path", lambda: Path("big-lama.pt") if has_model else None)
    monkeypatch.setattr(deps, "upscale_model_path", lambda model_id: Path("x.pth") if has_model else None)
    items = {item["id"]: item for item in deps.check_dependencies()}
    assert (items["lama"]["detail"], items["lama"]["sizeEstimate"]) == lama
    assert (items["upscale_general"]["detail"], items["upscale_general"]["sizeEstimate"]) == upscale


def test_a_file_left_behind_by_a_cut_off_move_is_removed_when_identical(tmp_path):
    old, new = tmp_path / "old", tmp_path / "new"
    (old / "pkg").mkdir(parents=True)
    (new / "pkg").mkdir(parents=True)
    for folder in (old, new):
        (folder / "pkg" / "same.py").write_text("same")
    (old / "pkg" / "differs.py").write_text("old copy")
    (new / "pkg" / "differs.py").write_text("new copy")

    paths.migrate_folder(old, new)

    assert not (old / "pkg" / "same.py").exists()
    assert (old / "pkg" / "differs.py").read_text() == "old copy"
    assert (new / "pkg" / "differs.py").read_text() == "new copy"
