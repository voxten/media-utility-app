// Global registry of backend jobs, fed by "job:*" bridge events.
// Tool pages keep their own job id and read live state with useJob(id).

import { create } from "zustand";
import i18n from "../i18n";
import { api, on } from "../lib/bridge";
import { translateMessage } from "../lib/jobMessage";
import type { HistoryEntry, JobInfo, LogEntry } from "../lib/types";
import { useSettings } from "./settings";

const MAX_LOGS = 1000;
/** Finished jobs kept in memory for a long session in the tray; older ones remain in the history. */
const MAX_FINISHED_JOBS = 100;
/** Finished helper steps kept: their results (PDF page thumbnails, link checks) are large and copied by the pages. */
const MAX_FINISHED_QUIET_JOBS = 10;

/**
 * Jobs left out of the job lists and the running count, and that finish without a toast, desktop
 * notification or sound: helper steps of a page interaction (link checks, PDF page thumbnails) and
 * engine updates, which EngineUpdateHost reports.
 * The same kinds the backend leaves out of the history (backend/core/history.py SKIPPED_KINDS).
 */
const QUIET_KINDS = new Set(["download.probe", "instagram.probe", "pdf.inspect", "download.engines"]);

export const isQuietJob = (kind: string | undefined) => !!kind && QUIET_KINDS.has(kind);

const notificationTitle = (jobTitle?: string | null) =>
  jobTitle ? `${i18n.t("app.name")} · ${translateMessage(i18n.t, jobTitle)}` : i18n.t("app.name");

// One context for every chime: browsers cap how many can exist and each holds an audio device.
let chimeContext: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (!chimeContext) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    chimeContext = new AudioCtx();
  }
  if (chimeContext.state === "suspended") chimeContext.resume().catch(() => undefined);
  return chimeContext;
}

export function playChime(kind: "done" | "error" = "done") {
  try {
    const ctx = audioContext();
    if (!ctx) return;
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

/** Native notification; the backend skips it while the window is in front unless `force`. */
export function showDesktopNotification(title: string, body: string, force = false) {
  api.app.notify(title, body, force).catch(() => undefined);
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
  /** Finished jobs saved by the backend, newest first (this session's included). */
  history: HistoryEntry[];
  /** Jobs whose retry already started, so every card of the same job (Home, Tasks) stops offering it. */
  retried: Record<string, true>;
  clearFinished: () => void;
  loadHistory: () => Promise<void>;
  /** Forgets one finished job; this session's card of it stays. */
  removeHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const useJobs = create<JobsStore>((set) => ({
  jobs: {},
  order: [],
  history: [],
  retried: {},
  loadHistory: async () => set({ history: await api.jobs.history() }),
  removeHistory: async (id) => {
    await api.jobs.removeHistory(id);
    set((state) => ({ history: state.history.filter((entry) => entry.id !== id) }));
  },
  clearHistory: async () => {
    await api.jobs.clearHistory();
    set({ history: [] });
  },
  clearFinished: () =>
    set((state) => ({
      jobs: Object.fromEntries(
        Object.entries(state.jobs).map(([id, job]) => [id, job.status === "running" ? job : { ...job, dismissed: true }]),
      ),
    })),
}));

/**
 * Drops the oldest finished jobs beyond the limits, or returns null when nothing has to go. The newest
 * job of each kind always stays, because the tool page that started it may still be showing it.
 */
export function pruneJobs(
  state: Pick<JobsStore, "jobs" | "order">,
  limits = { finished: MAX_FINISHED_JOBS, quiet: MAX_FINISHED_QUIET_JOBS },
): Pick<JobsStore, "jobs" | "order"> | null {
  const kinds = new Set<string>();
  const drop = new Set<string>();
  let finished = 0;
  let quiet = 0;
  for (const id of state.order) {
    const job = state.jobs[id];
    if (!job) continue;
    if (!kinds.has(job.kind)) {
      kinds.add(job.kind);
      continue;
    }
    if (job.status === "running") continue;
    if (isQuietJob(job.kind) ? ++quiet > limits.quiet : ++finished > limits.finished) drop.add(id);
  }
  if (drop.size === 0) return null;
  return {
    jobs: Object.fromEntries(Object.entries(state.jobs).filter(([id]) => !drop.has(id))),
    order: state.order.filter((id) => !drop.has(id)),
  };
}

function patch(jobId: string, fn: (job: JobState) => Partial<JobState>) {
  useJobs.setState((state) => {
    const job = state.jobs[jobId];
    if (!job) return state;
    return { jobs: { ...state.jobs, [jobId]: { ...job, ...fn(job) } } };
  });
}

function markRetried(jobId: string) {
  useJobs.setState((state) => ({ retried: { ...state.retried, [jobId]: true } }));
}

/** Runs a failed job again with the same settings; the failed card gives way to the new job. */
export async function retryJob(jobId: string) {
  const newId = await api.jobs.retry(jobId);
  if (newId) markRetried(jobId);
  patch(jobId, () => (newId ? { dismissed: true } : { retryable: false }));
  return newId;
}

/** Downloads the failed links of a queue again: in the queue while it runs, else in a new one. */
export async function retryFailedLinks(jobId: string) {
  const newId = await api.download.retryFailed(jobId);
  if (newId !== jobId) markRetried(jobId);
  return newId;
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

  on("job:meta", ({ jobId, meta }) => patch(jobId, (job) => ({ meta: { ...job.meta, ...meta } })));

  const finish = (
    jobId: string,
    status: JobState["status"],
    fields: Partial<JobState> | ((job: JobState) => Partial<JobState>) = {},
  ) => {
    patch(jobId, (job) => ({
      status,
      finishedAt: Date.now() / 1000,
      ...(typeof fields === "function" ? fields(job) : fields),
    }));
    useJobs.setState((state) => pruneJobs(state) ?? state);
  };

  on("job:done", ({ jobId, result }) => {
    finish(jobId, "done", (job) => ({
      result,
      percent: 100,
      partials: (result as { items?: unknown[] })?.items ?? job.partials,
    }));
    const s = useSettings.getState().settings;
    const job = useJobs.getState().jobs[jobId];
    if (isQuietJob(job?.kind)) return;
    if (s?.completionSound) playChime("done");
    if (s?.desktopNotifications) showDesktopNotification(notificationTitle(job?.title), i18n.t("jobs.notifyDone"));
  });

  on("job:error", ({ jobId, error }) => {
    finish(jobId, "error", { error });
    const s = useSettings.getState().settings;
    const job = useJobs.getState().jobs[jobId];
    if (isQuietJob(job?.kind)) return;
    if (s?.completionSound) playChime("error");
    if (s?.desktopNotifications) showDesktopNotification(notificationTitle(job?.title), error || i18n.t("jobs.notifyError"));
  });

  on("job:cancelled", ({ jobId }) => finish(jobId, "cancelled"));

  on("jobs:history", (entry) =>
    useJobs.setState((state) => ({ history: [entry, ...state.history.filter((e) => e.id !== entry.id)] })),
  );
}

/** History entries not already shown as a live card (jobs from this session that were not cleared). */
export function earlierJobs(history: HistoryEntry[], jobs: Record<string, JobState>): HistoryEntry[] {
  return history.filter((entry) => !jobs[entry.id] || jobs[entry.id].dismissed);
}

/** The result shape of a history entry's outputs (one file, its output folder, or several files) with its saved numbers. */
function historyResult(entry: HistoryEntry) {
  const saved = { ...entry.stats, ...(entry.items?.length ? { items: entry.items } : {}) };
  if (entry.singleFile) return { ...saved, path: entry.outputs[0] };
  if (entry.outputs.length === 1) return { ...saved, outdir: entry.outputs[0] };
  return { ...saved, files: entry.outputs };
}

/** A history entry in the shape JobCard renders. */
export function historyJob(entry: HistoryEntry): JobState {
  return {
    ...entry,
    percent: entry.status === "done" ? 100 : null,
    message: null,
    params: {},
    logs: [],
    partials: [],
    extra: {},
    result: entry.status === "done" ? historyResult(entry) : undefined,
  };
}

export function useJob(jobId: string | null | undefined): JobState | undefined {
  return useJobs((state) => (jobId ? state.jobs[jobId] : undefined));
}

/** This session's jobs for the job lists, newest first: not cleared and not a quiet helper step. */
export function listedJobs(state: Pick<JobsStore, "jobs" | "order">): JobState[] {
  return state.order.map((id) => state.jobs[id]).filter((job) => job && !job.dismissed && !isQuietJob(job.kind));
}

export function useRunningJobCount(): number {
  return useJobs(
    (state) => state.order.filter((id) => state.jobs[id]?.status === "running" && !isQuietJob(state.jobs[id].kind)).length,
  );
}
