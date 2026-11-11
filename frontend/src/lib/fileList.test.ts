import { describe, expect, it } from "vitest";
import { addUnique, removeFileAt } from "./fileList";

describe("addUnique", () => {
  it("appends new paths once", () => {
    expect(addUnique(["a", "b"], ["b", "c", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("removeFileAt", () => {
  const files = ["a", "b", "c"];

  it("keeps the selected file when an earlier one goes", () => {
    expect(removeFileAt(files, 2, 0)).toEqual({ files: ["b", "c"], selected: 1 });
  });

  it("moves to the neighbour when the selected file goes", () => {
    expect(removeFileAt(files, 1, 1)).toEqual({ files: ["a", "c"], selected: 1 });
    expect(removeFileAt(files, 2, 2)).toEqual({ files: ["a", "b"], selected: 1 });
  });

  it("falls back to 0 for the last file", () => {
    expect(removeFileAt(["a"], 0, 0)).toEqual({ files: [], selected: 0 });
  });
});
