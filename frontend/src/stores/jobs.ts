// Global registry of backend jobs, fed by "job:*" bridge events.
// Tool pages keep their own job id and read live state with useJob(id).

import { create } from "zustand";
import i18n from "../i18n";
import { on } from "../lib/bridge";
import type { JobInfo, LogEntry } from "../lib/types";
import { useSettings } from "./settings";

const MAX_LOGS = 2000;

export function playChime(kind: "done" | "error" = "done") {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (kind === "done") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.2);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch {
    /* audio might be disabled or restricted */
  }
}

export function showDesktopNotification(title: string, body?: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, { body, silent: true });
    } catch {}
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") {
        try {
          new Notification(title, { body, silent: true });
        } catch {}
      }
    });
  }
}

export interface JobState extends JobInfo {
  logs: LogEntry[];
  /** Intermediate results streamed with ctx.partial (kept here so none are missed before a page learns its job id). */
  partials: unknown[];
  result?: unknown;
  /** Extra fields from the last progress event (download speed, eta, ...). */
  extra: Record<string, unknown>;
  /** Hidden from the jobs panel / recent list; pages keep their own job state. */
  dismissed?: boolean;
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
    set((state) => ({
      jobs: Object.fromEntries(
        Object.entries(state.jobs).map(([id, job]) => [id, job.status === "running" ? job : { ...job, dismissed: true }]),
      ),
    })),
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

  const finish = (
    jobId: string,
    status: JobState["status"],
    fields: Partial<JobState> | ((job: JobState) => Partial<JobState>) = {},
  ) =>
    patch(jobId, (job) => ({
      status,
      finishedAt: Date.now() / 1000,
      ...(typeof fields === "function" ? fields(job) : fields),
    }));

  on("job:done", ({ jobId, result }) => {
    finish(jobId, "done", (job) => ({
      result,
      percent: 100,
      partials: (result as { items?: unknown[] })?.items ?? job.partials,
    }));
    const s = useSettings.getState().settings;
    if (s?.completionSound) playChime("done");
    if (s?.desktopNotifications) {
      const job = useJobs.getState().jobs[jobId];
      const title = job?.title ? `Media Studio · ${i18n.t(job.title)}` : "Media Studio";
      showDesktopNotification(title, "Zadanie ukończone pomyślnie / Task completed");
    }
  });

  on("job:error", ({ jobId, error }) => {
    finish(jobId, "error", { error });
    const s = useSettings.getState().settings;
    if (s?.completionSound) playChime("error");
    if (s?.desktopNotifications) {
      const job = useJobs.getState().jobs[jobId];
      const title = job?.title ? `Media Studio · ${i18n.t(job.title)}` : "Media Studio";
      showDesktopNotification(title, error || "Błąd wykonania zadania / Task failed");
    }
  });

  on("job:cancelled", ({ jobId }) => finish(jobId, "cancelled"));
}

export function useJob(jobId: string | null | undefined): JobState | undefined {
  return useJobs((state) => (jobId ? state.jobs[jobId] : undefined));
}

export function useRunningJobCount(): number {
  return useJobs((state) => state.order.filter((id) => state.jobs[id]?.status === "running").length);
}
