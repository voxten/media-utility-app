import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emitLocal } from "./bridge";
import type { JobInfo } from "./types";
import { useInstallJob } from "./useInstallJob";
import { initJobEvents, useJobs } from "../stores/jobs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const install = (id: string, depId: string): JobInfo => ({
  id,
  kind: "rembg.install",
  title: `deps.installTitle.${depId}`,
  status: "running",
  startedAt: 1000,
  finishedAt: null,
  error: null,
  percent: 40,
  message: null,
  params: {},
});

type Failed = (message: string) => void;

let root: Root | null = null;
let hook: ReturnType<typeof useInstallJob> | null = null;

function Banner({ onFailed, tick }: { onFailed: Failed; tick: number }) {
  hook = useInstallJob("rembg", { onFailed });
  return <span data-tick={tick} />;
}

function render(onFailed: Failed, tick = 0) {
  if (!root) root = createRoot(document.createElement("div"));
  act(() => root!.render(<Banner onFailed={onFailed} tick={tick} />));
}

beforeAll(() => initJobEvents());
beforeEach(() => useJobs.setState({ jobs: {}, order: [], history: [] }));
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  hook = null;
});

describe("useInstallJob", () => {
  it("shows an install that started elsewhere instead of offering a second one", () => {
    act(() => emitLocal("job:started", install("other-dep", "lama")));
    act(() => emitLocal("job:started", install("from-settings", "rembg")));
    render(vi.fn<Failed>());
    expect(hook!.job?.id).toBe("from-settings");
  });

  it("reports a failed install once, even when the page renders again", () => {
    const onFailed = vi.fn<Failed>();
    act(() => emitLocal("job:started", install("broken", "rembg")));
    render(onFailed);
    act(() => emitLocal("job:error", { jobId: "broken", error: 'errors.installFailed|{"code":1}' }));
    render(vi.fn<Failed>(), 1);
    render(onFailed, 2);

    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed.mock.calls[0][0]).toContain("1");
    expect(hook!.job).toBeUndefined();
  });
});
