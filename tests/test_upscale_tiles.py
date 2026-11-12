import numpy as np
import pytest

from backend.services import upscale

CPU_OUT_OF_MEMORY = "DefaultCPUAllocator: not enough memory: you tried to allocate 4294967296 bytes"


def _tiles_failing_above(limit, sizes, message=CPU_OUT_OF_MEMORY):
    def process(model, device, img, tile_size, scale, ctx):
        sizes.append(tile_size)
        if tile_size > limit:
            raise RuntimeError(message)
        return img

    return process


def test_upscale_tries_smaller_tiles_while_memory_runs_out(monkeypatch, ctx):
    sizes = []
    monkeypatch.setattr(upscale, "_process_tiles", _tiles_failing_above(64, sizes))
    img = np.zeros((8, 8, 3), dtype=np.uint8)

    assert upscale._upscale_tiles(None, "cpu", img, 256, ctx) is img
    assert sizes == [256, 128, 64]
    assert [log["params"]["size"] for log in ctx.of("job:log")] == [128, 64]


def test_upscale_gives_up_below_the_smallest_tile(monkeypatch, ctx):
    sizes = []
    monkeypatch.setattr(upscale, "_process_tiles", _tiles_failing_above(0, sizes, "CUDA out of memory."))
    with pytest.raises(RuntimeError, match="out of memory"):
        upscale._upscale_tiles(None, "cpu", np.zeros((8, 8, 3), dtype=np.uint8), 256, ctx)
    assert sizes == [256, 128, 64]


def test_upscale_does_not_retry_other_errors(monkeypatch, ctx):
    sizes = []
    monkeypatch.setattr(upscale, "_process_tiles", _tiles_failing_above(0, sizes, "size mismatch for conv_first"))
    with pytest.raises(RuntimeError, match="size mismatch"):
        upscale._upscale_tiles(None, "cpu", np.zeros((8, 8, 3), dtype=np.uint8), 256, ctx)
    assert sizes == [256]


def test_anime_model_uses_smaller_tiles_than_general():
    assert upscale.TILE_SIZES["anime"] < upscale.TILE_SIZES["general"]
