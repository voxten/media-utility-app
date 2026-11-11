import { describe, expect, it } from "vitest";
import { dirName, fileName, formatBytes, formatDuration, joinPath } from "./format";

describe("formatBytes", () => {
  it("picks a unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
  });

  it("shows a dash for missing or non-positive sizes", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("shows a dash for unknown durations", () => {
    expect(formatDuration(undefined)).toBe("—");
  });
});

describe("paths", () => {
  it("splits Windows and POSIX paths", () => {
    expect(fileName(String.raw`C:\a\b\photo.png`)).toBe("photo.png");
    expect(fileName("/tmp/x.pdf")).toBe("x.pdf");
    expect(dirName(String.raw`C:\a\b\photo.png`)).toBe(String.raw`C:\a\b`);
  });

  it("joins without doubling separators", () => {
    expect(joinPath(String.raw`C:\out`, "a.png")).toBe(String.raw`C:\out\a.png`);
    expect(joinPath("C:\\out\\", "a.png")).toBe(String.raw`C:\out\a.png`);
    expect(joinPath("", "a.png")).toBe("a.png");
  });
});
