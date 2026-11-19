import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { jobSummary, sizeChange } from "./jobSummary";

beforeAll(() => i18n.changeLanguage("en"));

const summary = (kind: string, result: unknown) => jobSummary(i18n.t, kind, result);

describe("jobSummary", () => {
  it("describes a downloaded video", () => {
    expect(summary("download", { path: "a.mp4", size: 50 * 1024 ** 2, height: 1080, ext: "mp4", length: 596 })).toEqual([
      "1080p",
      "MP4",
      "9:56",
      "50.0 MB",
    ]);
  });

  it("counts batch items and failures", () => {
    expect(summary("download.batch", { succeeded: 3, failed: 1, items: [{}, {}, {}, {}], totalSize: 1024 })).toEqual([
      "3 of 4",
      "1 failed",
      "1.0 KB",
    ]);
    expect(summary("instagram", { files: ["a", "b"], failed: 0, size: 2048 })).toEqual(["2 files", "2.0 KB"]);
  });

  it("shows how much smaller compressed files got", () => {
    expect(summary("compressor", { processed: 1, inBytes: 4096, outBytes: 1024, savedPercent: 75 })).toEqual([
      "4.0 KB → 1.0 KB (−75%)",
    ]);
    expect(summary("gif_editor.render", { processed: 3, inBytes: 4096, outBytes: 1024, savedPercent: 75 })[0]).toBe("3 files");
    expect(summary("converter", { converted: 12, inputBytes: 2048, outputBytes: 4096 })).toEqual([
      "12 files",
      "2.0 KB → 4.0 KB (+100%)",
    ]);
  });

  it("covers PDF, GIF, transcription, sync, images and duplicates", () => {
    expect(summary("pdf.merge", { outPath: "a.pdf", pageCount: 24, bytes: 1024 })).toEqual(["24 pages", "1.0 KB"]);
    expect(summary("pdf.split", { files: [], count: 1 })).toEqual(["1 file"]);
    expect(summary("video_to_gif.render", { width: 480, height: 270, frames: 120, size: 1024 })).toEqual([
      "480×270",
      "120 frames",
      "1.0 KB",
    ]);
    expect(summary("transcribe", { language: "pl", duration: 192, format: "srt" })).toEqual(["PL", "3:12", "SRT"]);
    expect(summary("video_sync", { offsetSec: 0.35, bytes: 1024 })).toEqual(["offset +0.35 s", "1.0 KB"]);
    expect(summary("upscale", { width: 1920, height: 1080 })).toEqual(["1920×1080"]);
    expect(summary("duplicates.image", { groups: [[], []], scanned: 320 })).toEqual(["2 groups", "320 files scanned"]);
    expect(summary("duplicates.video", { groups: 5 })).toEqual(["5 groups"]);
    expect(summary("duplicates.trash", { count: 2, failed: 1 })).toEqual(["2 files", "1 failed"]);
  });

  it("skips missing values and unknown kinds", () => {
    expect(summary("download", { path: "a.jpg" })).toEqual([]);
    expect(summary("rembg.install", { ok: true })).toEqual([]);
    expect(summary("download", null)).toEqual([]);
  });
});

describe("sizeChange", () => {
  it("needs both sizes", () => {
    expect(sizeChange(1024, undefined)).toBeUndefined();
    expect(sizeChange(0, 1024)).toBeUndefined();
    expect(sizeChange(1024, 1024)).toBe("1.0 KB → 1.0 KB");
  });
});
