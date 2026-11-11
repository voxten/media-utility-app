import { describe, expect, it } from "vitest";
import { toggleEntries } from "./playlistSelection";

describe("toggleEntries", () => {
  it("ticks and unticks one entry", () => {
    expect(toggleEntries([0, 2], 1, true, null, false)).toEqual([0, 1, 2]);
    expect(toggleEntries([0, 1, 2], 1, false, 0, false)).toEqual([0, 2]);
  });

  it("applies a Shift click to the whole range in either direction", () => {
    expect(toggleEntries([], 4, true, 1, true)).toEqual([1, 2, 3, 4]);
    expect(toggleEntries([0, 1, 2, 3, 4, 5], 1, false, 4, true)).toEqual([0, 5]);
  });

  it("treats a Shift click without an earlier click as a single click", () => {
    expect(toggleEntries([], 3, true, null, true)).toEqual([3]);
  });
});
