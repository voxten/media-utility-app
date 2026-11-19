import { describe, expect, it } from "vitest";
import { fileExtension, formatList, formatName, mediaKind } from "./fileTypes";
import { matchesExtensions } from "./drop";

describe("fileExtension", () => {
  it("returns the lower-case extension with the dot", () => {
    expect(fileExtension(String.raw`C:\x\Photo.JPG`)).toBe(".jpg");
    expect(fileExtension("archive.tar.gz")).toBe(".gz");
  });

  it("is empty without an extension", () => {
    expect(fileExtension(String.raw`C:\x\README`)).toBe("");
    expect(fileExtension(String.raw`C:\v1.2\README`)).toBe("");
  });
});

describe("mediaKind", () => {
  it("recognises every kind tools exchange", () => {
    expect(mediaKind("a.gif")).toBe("gif");
    expect(mediaKind("a.APNG")).toBe("gif");
    expect(mediaKind("a.webp")).toBe("image");
    expect(mediaKind("a.PDF")).toBe("pdf");
    expect(mediaKind("a.mkv")).toBe("video");
    expect(mediaKind("a.mp3")).toBe("audio");
    expect(mediaKind("a.txt")).toBeNull();
  });
});

describe("format names", () => {
  it("normalises ids, extensions and codecs", () => {
    expect(formatName("webp")).toBe("WebP");
    expect(formatName(".jpg")).toBe("JPEG");
    expect(formatName("xyz")).toBe("XYZ");
  });

  it("lists each display name once", () => {
    expect(formatList([".jpg", ".jpeg", ".png"])).toBe("JPEG, PNG");
  });
});

describe("matchesExtensions", () => {
  it("accepts everything without a filter", () => {
    expect(matchesExtensions("a.exe")).toBe(true);
    expect(matchesExtensions("a.exe", [])).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(matchesExtensions(String.raw`C:\A.PNG`, [".png"])).toBe(true);
    expect(matchesExtensions(String.raw`C:\a.pdf`, [".png", ".jpg"])).toBe(false);
  });
});
