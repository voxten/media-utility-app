import { describe, expect, it } from "vitest";
import type { JobState } from "../stores/jobs";
import { extractSubtasks, openTarget, revealTarget, transferTargets } from "./JobCard";

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

  it("marks the current item as running with live speed", () => {
    const items = extractSubtasks(
      job({ partials: [{ index: 0, url: "https://a" }], extra: { item: 0, itemPercent: 30, speed: 500 } }),
    );
    expect(items[0]).toMatchObject({ status: "running", percent: 30, speed: 500 });
  });

  it("takes final items from the result", () => {
    const items = extractSubtasks(
      job({ status: "done", result: { items: [{ index: 0, title: "Done", size: 7 }, { index: 1, status: "error", error: "x" }] } }),
    );
    expect(items[0]).toMatchObject({ status: "done", percent: 100, size: 7 });
    expect(items[1]).toMatchObject({ status: "error", error: "x", title: "#2" });
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
