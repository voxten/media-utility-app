import { describe, expect, it } from "vitest";
import type { JobState } from "../stores/jobs";
import { taskbarProgress } from "./useTaskbarProgress";

const job = (status: JobState["status"], percent: number | null) => ({ status, percent }) as JobState;

describe("taskbarProgress", () => {
  it("is empty without running jobs", () => {
    expect(taskbarProgress([job("done", 100)])).toEqual({ state: "none", value: 0 });
  });

  it("averages the running jobs that report progress", () => {
    expect(taskbarProgress([job("running", 20), job("running", 61), job("running", null), job("error", 5)])).toEqual({
      state: "normal",
      value: 41,
    });
  });

  it("moves without a percentage", () => {
    expect(taskbarProgress([job("running", null)]).state).toBe("indeterminate");
  });
});
