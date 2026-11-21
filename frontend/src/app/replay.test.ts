import { beforeEach, describe, expect, it } from "vitest";
import { useConverterForm } from "../features/converter/store";
import { useDownloadForm } from "../features/download/store";
import { useMediaConvertForm } from "../features/media_convert/store";
import { usePdfMergeForm } from "../features/pdf/store";
import { openWithSettings, replayTool } from "./replay";

const converter = useConverterForm.getState();
const media = useMediaConvertForm.getState();
const download = useDownloadForm.getState();
const merge = usePdfMergeForm.getState();

beforeEach(() => {
  useConverterForm.setState(converter, true);
  useMediaConvertForm.setState(media, true);
  useDownloadForm.setState(download, true);
  usePdfMergeForm.setState(merge, true);
  window.location.hash = "";
});

describe("open with these settings", () => {
  it("fills the image converter and opens it", async () => {
    await openWithSettings({
      method: "converter.start",
      args: [{ files: ["C:\\a.png", "C:\\b.png"], outputDir: "C:\\out", outFormat: "JPEG", quality: 55, method: 3 }],
    });
    expect(useConverterForm.getState()).toMatchObject({
      source: "files",
      files: ["C:\\a.png", "C:\\b.png"],
      outputDir: "C:\\out",
      outFormat: "JPEG",
      quality: 55,
      method: 3,
    });
    expect(window.location.hash).toBe("#/converter");
  });

  it("restores a folder conversion and ignores values the form does not know", async () => {
    await openWithSettings({
      method: "converter.start",
      args: [{ inputDir: "C:\\photos", inFormat: "BMP", outFormat: "RAW", outputDir: "C:\\out", quality: "high" }],
    });
    expect(useConverterForm.getState()).toMatchObject({
      source: "folder",
      inputDir: "C:\\photos",
      inFormat: "BMP",
      outFormat: "WEBP",
      quality: 80,
    });
  });

  it("puts a trim and a target size back into the video converter", async () => {
    await openWithSettings({
      method: "media_convert.start",
      args: [{ paths: ["C:\\clip.mkv"], outputDir: "C:\\out", format: "mp4", codec: "hevc", copy: false, quality: "small", targetMb: 25, height: 720, mute: false, audioKbps: 128, normalize: true, start: 2, end: 9 }],
    });
    expect(useMediaConvertForm.getState()).toMatchObject({
      files: ["C:\\clip.mkv"],
      codec: "hevc",
      sizeMode: "size",
      targetMb: 25,
      height: "720",
      audioKbps: "128",
      normalize: true,
      range: { start: 2, end: 9 },
    });
  });

  it("lists a queue's links again", async () => {
    await openWithSettings({
      method: "download.batch",
      args: [{ urls: ["https://youtu.be/a", "https://youtu.be/b"], outdir: "C:\\dl", mode: "audio", audioCodec: "opus", maxHeight: 0 }],
    });
    expect(useDownloadForm.getState()).toMatchObject({
      tab: "batch",
      batchText: "https://youtu.be/a\nhttps://youtu.be/b",
      batchMode: "audio",
      audioCodec: "opus",
      outdir: "C:\\dl",
    });
    expect(window.location.hash).toBe("#/download");
  });

  it("asks the merge page to read the pages again in their order", async () => {
    await openWithSettings({
      method: "pdf.merge",
      args: [[{ file: "C:\\b.pdf", page: 2, rotation: 90 }, { file: "C:\\a.pdf", page: 0, rotation: 0 }], "C:\\out\\joined.pdf"],
    });
    expect(usePdfMergeForm.getState()).toMatchObject({
      pages: [],
      outputDir: "C:\\out",
      outputName: "joined",
      restore: [{ file: "C:\\b.pdf", page: 2, rotation: 90 }, { file: "C:\\a.pdf", page: 0, rotation: 0 }],
    });
  });

  it("knows which saved calls a form can take", () => {
    expect(replayTool({ method: "pdf.split", args: [] })).toBe("pdf_split");
    expect(replayTool({ method: "image_editor.start_batch", args: [] })).toBeNull();
    expect(replayTool({ method: "system.restart", args: [] })).toBeNull();
    expect(replayTool(undefined)).toBeNull();
  });
});
