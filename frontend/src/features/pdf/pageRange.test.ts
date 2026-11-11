import { describe, expect, it } from "vitest";
import { formatPageRange, parsePageRange } from "./pageRange";

describe("parsePageRange", () => {
  it("parses single pages and ranges into 0-based indexes", () => {
    expect(parsePageRange("1-3, 5", 10)).toEqual([0, 1, 2, 4]);
  });

  it("keeps the typed order and drops duplicates", () => {
    expect(parsePageRange("5, 1-2, 2", 10)).toEqual([4, 0, 1]);
  });

  it("clamps ranges to the document and skips pages outside it", () => {
    expect(parsePageRange("0-2, 9-12, 40", 10)).toEqual([0, 1, 8, 9]);
  });

  it("ignores empty parts and garbage", () => {
    expect(parsePageRange(" , abc, 2-x, 3", 5)).toEqual([2]);
    expect(parsePageRange("", 5)).toEqual([]);
  });

  it("returns nothing for a reversed range", () => {
    expect(parsePageRange("5-3", 10)).toEqual([]);
  });
});

describe("formatPageRange", () => {
  it("collapses consecutive pages", () => {
    expect(formatPageRange([0, 1, 2, 4])).toBe("1-3, 5");
  });

  it("sorts and deduplicates", () => {
    expect(formatPageRange([4, 0, 0, 1])).toBe("1-2, 5");
  });

  it("is empty for no pages", () => {
    expect(formatPageRange([])).toBe("");
  });

  it("round-trips with parsePageRange", () => {
    const pages = [0, 2, 3, 4, 7];
    expect(parsePageRange(formatPageRange(pages), 10)).toEqual(pages);
  });
});
