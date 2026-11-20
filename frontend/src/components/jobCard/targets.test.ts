import { describe, expect, it } from "vitest";
import type { JobState } from "../../stores/jobs";
import { extractSubtasks, jobLinks, openTarget, queueOrder, revealTarget, runningItems, transferTargets } from "./targets";

const job = (fields: Partial<JobState>): JobState => ({
  id: "j",
  kind: "download.batch",
  title: "",
  status: "running",
  startedAt: 0,
  finishedAt: null,
  error: null,
  percent: null,
  message: null,
  params: {},
  logs: [],
  partials: [],
  extra: {},
  ...fields,
});

describe("extractSubtasks", () => {
  it("is empty for a job without items", () => {
    expect(extractSubtasks(job({}))).toEqual([]);
  });

  it("merges partial updates per item and keeps earlier fields", () => {
    const items = extractSubtasks(
      job({
        partials: [
          { index: 1, url: "https://b", status: "pending" },
          { index: 0, url: "https://a", status: "pending", size: 10 },
          { index: 0, title: "Clip A", status: "done" },
        ],
      }),
    );
    expect(items.map((i) => i.id)).toEqual([0, 1]);
    expect(items[0]).toMatchObject({ title: "Clip A", status: "done", size: 10 });
    expect(items[1]).toMatchObject({ title: "https://b", status: "pending" });
  });

  it("marks every running item with its own progress", () => {
    const items = extractSubtasks(
      job({
        partials: [
          { index: 0, url: "https://a", status: "pending" },
          { index: 1, url: "https://b", status: "pending" },
          { index: 2, url: "https://c", status: "pending" },
        ],
        extra: {
          running: [
            { index: 0, percent: 30, speed: 500, total: 1000 },
            { index: 2, percent: 70, speed: 200, eta: 4 },
          ],
        },
      }),
    );
    expect(items[0]).toMatchObject({ status: "running", percent: 30, speed: 500, size: 1000 });
    expect(items[1]).toMatchObject({ status: "pending" });
    expect(items[2]).toMatchObject({ status: "running", percent: 70, speed: 200, eta: 4 });
  });

  it("ignores running items once the job has ended", () => {
    const items = extractSubtasks(
      job({ status: "cancelled", partials: [{ index: 0, url: "https://a", status: "pending" }], extra: { running: [{ index: 0, percent: 50 }] } }),
    );
    expect(items[0]).toMatchObject({ status: "pending" });
    expect(items[0].percent).toBeUndefined();
  });

  it("lists the items in the order the queue reported", () => {
    const items = extractSubtasks(
      job({
        partials: [0, 1, 2].map((index) => ({ index, url: `https://${index}`, status: "pending" })),
        extra: { order: [2, 0, 1] },
      }),
    );
    expect(items.map((i) => i.id)).toEqual([2, 0, 1]);
  });

  it("takes final items from the result", () => {
    const items = extractSubtasks(
      job({ status: "done", result: { items: [{ index: 0, title: "Done", size: 7 }, { index: 1, status: "error", error: "x" }] } }),
    );
    expect(items[0]).toMatchObject({ status: "done", percent: 100, size: 7 });
    expect(items[1]).toMatchObject({ status: "error", error: "x", title: "#2" });
  });

  it("keeps each item's link next to its title", () => {
    const items = extractSubtasks(
      job({ partials: [{ index: 0, url: "https://a", status: "pending" }, { index: 0, title: "Clip A", status: "done" }] }),
    );
    expect(items[0]).toMatchObject({ title: "Clip A", url: "https://a" });
  });

  it("lists the saved links of a queue that left no items", () => {
    const items = extractSubtasks(job({ status: "cancelled", meta: { urls: ["https://a", "https://b"] } }));
    expect(items).toEqual([
      { id: 0, title: "https://a", url: "https://a", status: "unknown" },
      { id: 1, title: "https://b", url: "https://b", status: "unknown" },
    ]);
  });
});

describe("runningItems and queueOrder", () => {
  it("skip malformed entries", () => {
    const running = runningItems(job({ extra: { running: [null, { percent: 5 }, { index: 1, percent: "x" }] } }));
    expect([...running.values()]).toEqual([{ index: 1, percent: 0, speed: undefined, eta: undefined, downloaded: undefined, total: undefined }]);
    expect(queueOrder(job({ extra: { order: [1, "a"] } }))).toBeUndefined();
    expect(queueOrder(job({ extra: { order: [1, 0] } }))).toEqual([1, 0]);
    expect(queueOrder(null)).toBeUndefined();
  });
});

describe("jobLinks", () => {
  it("is the one link of a single download", () => {
    const single = job({ kind: "download", status: "done", meta: { url: "https://a" } });
    expect(jobLinks(single, extractSubtasks(single))).toEqual(["https://a"]);
  });

  it("is every distinct link of a queue", () => {
    const queue = job({
      status: "done",
      result: { items: [{ index: 0, url: "https://a" }, { index: 1, url: "https://b" }, { index: 2, url: "https://a" }] },
    });
    expect(jobLinks(queue, extractSubtasks(queue))).toEqual(["https://a", "https://b"]);
  });

  it("is empty for a job without links", () => {
    const plain = job({ kind: "converter", status: "done" });
    expect(jobLinks(plain, [])).toEqual([]);
  });
});

describe("revealTarget", () => {
  it("prefers a saved file, then the output folder", () => {
    expect(revealTarget({ outPath: "/out/a.png" })).toBe("/out/a.png");
    expect(revealTarget({ title: "Clip", path: "/dl/clip.mp4" })).toBe("/dl/clip.mp4");
    expect(revealTarget({ files: ["/out/1.webp", "/out/2.webp"], outputDir: "/out" })).toBe("/out/1.webp");
    expect(revealTarget({ items: [], outdir: "/dl" })).toBe("/dl");
  });

  it("never points at an unsaved preview", () => {
    expect(revealTarget({ resultPath: "/cache/upscale.png", dataUrl: "data:" })).toBeNull();
    expect(revealTarget(null)).toBeNull();
  });
});

describe("transferTargets", () => {
  it("offers the downloaded file of a single-video download", () => {
    expect(transferTargets({ title: "Clip", path: "/dl/clip.mp4", size: 10 })).toEqual(["/dl/clip.mp4"]);
  });

  it("keeps the other result shapes", () => {
    expect(transferTargets({ outPath: "/out/a.png", path: "/in/a.png" })).toEqual(["/out/a.png"]);
    expect(transferTargets({ resultPath: "/cache/upscale.png" })).toEqual(["/cache/upscale.png"]);
    expect(transferTargets({ files: ["/out/1.webp", "/out/2.webp"] })).toEqual(["/out/1.webp", "/out/2.webp"]);
  });

  it("is empty without output files", () => {
    expect(transferTargets({ items: [], outdir: "/dl" })).toEqual([]);
    expect(transferTargets({ path: "" })).toEqual([]);
    expect(transferTargets(null)).toEqual([]);
  });
});

describe("openTarget", () => {
  it("opens the one file a job wrote", () => {
    expect(openTarget({ title: "Clip", path: "/dl/clip.mp4" })).toBe("/dl/clip.mp4");
    expect(openTarget({ outPath: "/out/a.pdf", bytes: 1 })).toBe("/out/a.pdf");
    expect(openTarget({ files: ["/ig/photo.jpg"] })).toBe("/ig/photo.jpg");
  });

  it("offers nothing for several files, a folder or an unsaved preview", () => {
    expect(openTarget({ outPath: "/out/1.gif", files: ["/out/1.gif", "/out/2.gif"] })).toBeNull();
    expect(openTarget({ items: [], outdir: "/dl" })).toBeNull();
    expect(openTarget({ resultPath: "/cache/upscale.png" })).toBeNull();
    expect(openTarget(undefined)).toBeNull();
  });
});
