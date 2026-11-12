import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emitLocal } from "./bridge";
import type { JobInfo } from "./types";
import { useJobRunner } from "./useJobRunner";
import { initJobEvents, useJobs } from "../stores/jobs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const started = (id: string): JobInfo => ({
  id,
  kind: "duplicates",
  title: "scan",
  status: "running",
  startedAt: 1000,
  finishedAt: null,
  error: null,
  percent: null,
  message: null,
  params: {},
});

type Callback = (result: string) => void;

interface Callbacks {
  onResult: ReturnType<typeof vi.fn<Callback>>;
  onDone: ReturnType<typeof vi.fn<Callback>>;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let runner: ReturnType<typeof useJobRunner<string>> | null = null;

function Page({ callbacks }: { callbacks: Callbacks }) {
  runner = useJobRunner<string>("test-page", callbacks);
  return null;
}

function mount(callbacks: Callbacks) {
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root!.render(<Page callbacks={callbacks} />));
}

function unmount() {
  act(() => root?.unmount());
  root = null;
}

const callbacks = (): Callbacks => ({ onResult: vi.fn<Callback>(), onDone: vi.fn<Callback>() });

beforeAll(() => initJobEvents());
beforeEach(() => useJobs.setState({ jobs: {}, order: [], history: [] }));
afterEach(() => {
  unmount();
  runner = null;
  vi.restoreAllMocks();
});

describe("useJobRunner", () => {
  it("keeps the result of a job that ended while the page was closed, without feedback", async () => {
    const first = callbacks();
    mount(first);
    await act(() => runner!.start(async () => "job-away"));
    act(() => emitLocal("job:started", started("job-away")));
    unmount();

    act(() => emitLocal("job:done", { jobId: "job-away", result: "groups" }));
    const finished = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(finished + 5000);

    const second = callbacks();
    mount(second);
    expect(second.onResult).toHaveBeenCalledTimes(1);
    expect(second.onResult.mock.calls[0][0]).toBe("groups");
    expect(second.onDone).not.toHaveBeenCalled();
    expect(first.onResult).not.toHaveBeenCalled();
  });

  it("hands a result over only once, so a cleared result does not come back", async () => {
    const first = callbacks();
    mount(first);
    await act(() => runner!.start(async () => "job-once"));
    act(() => emitLocal("job:started", started("job-once")));
    act(() => emitLocal("job:done", { jobId: "job-once", result: "groups" }));
    expect(first.onResult).toHaveBeenCalledTimes(1);
    expect(first.onDone).toHaveBeenCalledTimes(1);
    unmount();

    const second = callbacks();
    mount(second);
    expect(second.onResult).not.toHaveBeenCalled();
    expect(second.onDone).not.toHaveBeenCalled();
  });
});
