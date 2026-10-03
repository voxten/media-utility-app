// Global registry of backend jobs, fed by "job:*" bridge events.
// Tool pages keep their own job id and read live state with useJob(id).

import { create } from "zustand";
import { on } from "../lib/bridge";
import type { JobInfo, LogEntry } from "../lib/types";

const MAX_LOGS = 2000;

export interface JobState extends JobInfo {
  logs: LogEntry[];
  /** Intermediate results streamed with ctx.partial (kept here so none are missed before a page learns its job id). */
  partials: unknown[];
  result?: unknown;
  /** Extra fields from the last progress event (download speed, eta, ...). */
  extra: Record<string, unknown>;
}

interface JobsStore {
  jobs: Record<string, JobState>;
  order: string[];
  clearFinished: () => void;
}

export const useJobs = create<JobsStore>((set) => ({
  jobs: {},
  order: [],
  clearFinished: () =>
    set((state) => {
      const jobs = Object.fromEntries(Object.entries(state.jobs).filter(([, j]) => j.status === "running"));
      return { jobs, order: state.order.filter((id) => id in jobs) };
    }),
}));

function patch(jobId: string, fn: (job: JobState) => Partial<JobState>) {
  useJobs.setState((state) => {
    const job = state.jobs[jobId];
    if (!job) return state;
    return { jobs: { ...state.jobs, [jobId]: { ...job, ...fn(job) } } };
  });
}

let initialised = false;

export function initJobEvents() {
  if (initialised) return;
  initialised = true;

  on("job:started", (info) =>
    useJobs.setState((state) => ({
      jobs: { ...state.jobs, [info.id]: { ...info, logs: [], partials: [], extra: {} } },
      order: [info.id, ...state.order.filter((id) => id !== info.id)],
    })),
  );

  on("job:progress", ({ jobId, percent, message, params, ...extra }) =>
    patch(jobId, (job) => ({
      percent,
      message: message ?? job.message,
      params: params ?? job.params,
      extra: extra as Record<string, unknown>,
    })),
  );

  on("job:log", ({ jobId, ...entry }) =>
    patch(jobId, (job) => ({ logs: [...job.logs, entry].slice(-MAX_LOGS) })),
  );

  on("job:partial", ({ jobId, data }) => patch(jobId, (job) => ({ partials: [...job.partials, data] })));

  const finish = (jobId: string, status: JobState["status"], fields: Partial<JobState> = {}) =>
    patch(jobId, () => ({ status, finishedAt: Date.now() / 1000, ...fields }));

  // Partials are only needed while a job streams; the final result supersedes them.
  on("job:done", ({ jobId, result }) => finish(jobId, "done", { result, percent: 100, partials: [] }));
  on("job:error", ({ jobId, error }) => finish(jobId, "error", { error }));
  on("job:cancelled", ({ jobId }) => finish(jobId, "cancelled"));
}

export function useJob(jobId: string | null | undefined): JobState | undefined {
  return useJobs((state) => (jobId ? state.jobs[jobId] : undefined));
}

export function useRunningJobCount(): number {
  return useJobs((state) => state.order.filter((id) => state.jobs[id]?.status === "running").length);
}
