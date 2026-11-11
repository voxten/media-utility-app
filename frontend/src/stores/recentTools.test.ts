import { describe, expect, it } from "vitest";
import { pushRecent } from "./recentTools";

describe("pushRecent", () => {
  it("puts the tool first", () => {
    expect(pushRecent(["a", "b"], "c")).toEqual(["c", "a", "b"]);
  });

  it("moves an existing tool to the front instead of duplicating it", () => {
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });

  it("drops the oldest beyond the limit", () => {
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });
});
