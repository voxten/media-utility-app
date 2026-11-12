import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./bridge";
import { CACHE_SIZE, MAX_PARALLEL, loadThumbnail, type Thumbnail } from "./useThumbnail";

const thumb = (path: string): Thumbnail => ({ width: 1, height: 1, format: "PNG", size: 1, dataUrl: path });

afterEach(() => vi.restoreAllMocks());

describe("loadThumbnail", () => {
  it("decodes a few files at a time instead of all at once", async () => {
    const finish: Array<() => void> = [];
    let running = 0;
    let most = 0;
    vi.spyOn(api.image_editor, "thumbnail").mockImplementation(
      (path: string) =>
        new Promise<Thumbnail>((resolve) => {
          running += 1;
          most = Math.max(most, running);
          finish.push(() => {
            running -= 1;
            resolve(thumb(path));
          });
        }),
    );

    const all = Array.from({ length: 20 }, (_, n) => loadThumbnail(`C:\\queue\\${n}.png`));
    while (finish.length) {
      finish.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    }
    const results = await Promise.all(all);

    expect(most).toBe(MAX_PARALLEL);
    expect(results.map((r) => r?.dataUrl)).toEqual(Array.from({ length: 20 }, (_, n) => `C:\\queue\\${n}.png`));
  });

  it("forgets the least recently used thumbnails beyond the cache size", async () => {
    const calls = vi.spyOn(api.image_editor, "thumbnail").mockImplementation((path: string) => Promise.resolve(thumb(path)));
    await loadThumbnail("C:\\lru\\first.png");
    for (let n = 0; n < CACHE_SIZE; n += 1) {
      await loadThumbnail(`C:\\lru\\${n}.png`);
      if (n === 10) await loadThumbnail("C:\\lru\\0.png");
    }
    calls.mockClear();

    await loadThumbnail("C:\\lru\\0.png");
    expect(calls).not.toHaveBeenCalled();
    await loadThumbnail("C:\\lru\\first.png");
    expect(calls).toHaveBeenCalledTimes(1);
  });
});
