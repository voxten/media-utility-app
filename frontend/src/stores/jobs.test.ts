import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api, emitLocal } from "../lib/bridge";
import type { HistoryEntry, JobInfo, Settings } from "../lib/types";
import { earlierJobs, historyJob, initJobEvents, isQuietJob, listedJobs, retryJob, useJobs } from "./jobs";
import { useSettings } from "./settings";

const started = (id: string, extra: Partial<JobInfo> = {}): JobInfo => ({
  id,
  kind: "converter",
  title: "WEBP",
  status: "running",
  startedAt: 1000,
  finishedAt: null,
  error: null,
  percent: null,
  message: null,
  params: {},
  ...extra,
});

beforeAll(() => initJobEvents());
beforeEach(() => useJobs.setState({ jobs: {}, order: [], history: [] }));
afterEach(() => vi.restoreAllMocks());

describe("jobs store", () => {
  it("adds started jobs newest first", () => {
    emitLocal("job:started", started("a"));
    emitLocal("job:started", started("b"));
    expect(useJobs.getState().order).toEqual(["b", "a"]);
    expect(useJobs.getState().jobs.a).toMatchObject({ status: "running", logs: [], partials: [] });
  });

  it("applies progress, logs and partial results", () => {
    emitLocal("job:started", started("a"));
    emitLocal("job:progress", { jobId: "a", percent: 40, message: "converter.status.converting", params: { name: "x" }, speed: 12 });
    emitLocal("job:log", { jobId: "a", message: "log.line", params: {}, level: "info", time: 1 });
    emitLocal("job:partial", { jobId: "a", data: { index: 0 } });

    const job = useJobs.getState().jobs.a;
    expect(job).toMatchObject({ percent: 40, message: "converter.status.converting", params: { name: "x" }, extra: { speed: 12 } });
    expect(job.logs).toHaveLength(1);
    expect(job.partials).toEqual([{ index: 0 }]);
  });

  it("finishes with a result, an error or a cancellation", () => {
    for (const id of ["ok", "bad", "stop"]) emitLocal("job:started", started(id));
    emitLocal("job:done", { jobId: "ok", result: { outPath: "C:\\out.webp" } });
    emitLocal("job:error", { jobId: "bad", error: "boom" });
    emitLocal("job:cancelled", { jobId: "stop" });

    const { jobs } = useJobs.getState();
    expect(jobs.ok).toMatchObject({ status: "done", percent: 100, result: { outPath: "C:\\out.webp" } });
    expect(jobs.ok.finishedAt).not.toBeNull();
    expect(jobs.bad).toMatchObject({ status: "error", error: "boom" });
    expect(jobs.stop.status).toBe("cancelled");
  });

  it("ignores events for unknown jobs", () => {
    emitLocal("job:progress", { jobId: "ghost", percent: 10, message: null, params: {} });
    expect(useJobs.getState().jobs).toEqual({});
  });

  it("clears only finished jobs", () => {
    emitLocal("job:started", started("run"));
    emitLocal("job:started", started("done"));
    emitLocal("job:done", { jobId: "done", result: null });
    useJobs.getState().clearFinished();

    const { jobs } = useJobs.getState();
    expect(jobs.run.dismissed).toBeUndefined();
    expect(jobs.done.dismissed).toBe(true);
  });
});

const saved = (id: string): HistoryEntry => ({
  id,
  kind: "converter",
  title: "WEBP",
  status: "done",
  startedAt: 1,
  finishedAt: 2,
  error: null,
  outputs: [`/out/${id}.webp`],
  available: true,
});

describe("job history", () => {
  it("puts newly saved jobs first without duplicates", () => {
    useJobs.setState({ history: [saved("old"), saved("a")] });
    emitLocal("jobs:history", saved("a"));
    expect(useJobs.getState().history.map((e) => e.id)).toEqual(["a", "old"]);
  });

  it("shows only entries that are not live cards", () => {
    emitLocal("job:started", started("live"));
    emitLocal("job:started", started("cleared"));
    emitLocal("job:done", { jobId: "cleared", result: null });
    useJobs.getState().clearFinished();

    const history = [saved("live"), saved("cleared"), saved("old")];
    expect(earlierJobs(history, useJobs.getState().jobs).map((e) => e.id)).toEqual(["cleared", "old"]);
  });

  it("renders saved outputs as one file, the output folder or several files", () => {
    expect(historyJob({ ...saved("a"), singleFile: true })).toMatchObject({ status: "done", percent: 100, result: { path: "/out/a.webp" }, logs: [] });
    expect(historyJob({ ...saved("dir"), outputs: ["/dl"] }).result).toEqual({ outdir: "/dl" });
    expect(historyJob({ ...saved("many"), outputs: ["/1", "/2"] }).result).toEqual({ files: ["/1", "/2"] });
    expect(historyJob({ ...saved("b"), status: "error", error: "boom" }).result).toBeUndefined();
  });
});

describe("retryJob", () => {
  it("hides the failed card once the new job starts", async () => {
    emitLocal("job:started", started("bad", { retryable: true }));
    emitLocal("job:error", { jobId: "bad", error: "boom" });
    const retry = vi.spyOn(api.jobs, "retry").mockResolvedValue("again");

    await expect(retryJob("bad")).resolves.toBe("again");
    expect(retry).toHaveBeenCalledWith("bad");
    expect(useJobs.getState().jobs.bad.dismissed).toBe(true);
  });

  it("drops the retry option when the backend cannot run the job again", async () => {
    emitLocal("job:started", started("bad", { retryable: true }));
    emitLocal("job:error", { jobId: "bad", error: "boom" });
    vi.spyOn(api.jobs, "retry").mockResolvedValue(null);

    await retryJob("bad");
    const job = useJobs.getState().jobs.bad;
    expect(job.retryable).toBe(false);
    expect(job.dismissed).toBeUndefined();
  });
});

describe("quiet jobs", () => {
  it("covers link checks, PDF thumbnails and engine updates", () => {
    for (const kind of ["download.probe", "instagram.probe", "pdf.inspect", "download.engines"]) {
      expect(isQuietJob(kind)).toBe(true);
    }
    expect(isQuietJob("download")).toBe(false);
    expect(isQuietJob(undefined)).toBe(false);
  });

  it("sends desktop notifications only for other jobs", () => {
    useSettings.setState({ settings: { desktopNotifications: true, completionSound: false } as Settings });
    const notify = vi.spyOn(api.app, "notify").mockResolvedValue(true);
    emitLocal("job:started", started("probe", { kind: "instagram.probe", title: "https://www.instagram.com/p/x/" }));
    emitLocal("job:done", { jobId: "probe", result: null });
    emitLocal("job:started", started("engines", { kind: "download.engines" }));
    emitLocal("job:error", { jobId: "engines", error: "offline" });
    expect(notify).not.toHaveBeenCalled();

    emitLocal("job:started", started("convert"));
    emitLocal("job:done", { jobId: "convert", result: null });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe("listedJobs", () => {
  it("leaves out cleared jobs and quiet helper steps", () => {
    emitLocal("job:started", started("work"));
    emitLocal("job:started", started("probe", { kind: "download.probe" }));
    emitLocal("job:started", started("old"));
    emitLocal("job:done", { jobId: "old", result: {} });
    useJobs.getState().clearFinished();
    emitLocal("job:started", started("new"));

    expect(listedJobs(useJobs.getState()).map((j) => j.id)).toEqual(["new", "work"]);
  });
});
