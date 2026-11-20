import type { JobState } from "../../stores/jobs";

export interface SubtaskAction {
  id: string | number;
  title: string;
  /** The item's link, when it came from one. */
  url?: string;
  /** "unknown" for a link of a queue that ended before reporting this item. */
  status: "pending" | "running" | "done" | "error" | "cancelled" | "skipped" | "unknown";
  percent?: number;
  speed?: number;
  eta?: number;
  error?: string;
  size?: number;
  duration?: number;
}

export function extractSubtasks(job: JobState): SubtaskAction[] {
  const items = new Map<number | string, SubtaskAction>();

  if (Array.isArray(job.partials) && job.partials.length > 0) {
    for (const p of job.partials) {
      if (p && typeof p === "object") {
        const item = p as Record<string, unknown>;
        const idx = typeof item.index === "number" ? item.index : (typeof item.id === "string" ? item.id : null);
        if (idx != null) {
          const rawTitle = String(item.title || item.name || item.url || `#${Number(idx) + 1}`);
          const status = (item.status as SubtaskAction["status"]) || "pending";
          const existing = items.get(idx);
          items.set(idx, {
            id: idx,
            title: rawTitle,
            url: typeof item.url === "string" && item.url ? item.url : existing?.url,
            status,
            error: item.error ? String(item.error) : existing?.error,
            percent: typeof item.percent === "number" ? item.percent : existing?.percent,
            size: typeof item.size === "number" ? item.size : existing?.size,
            duration: typeof item.duration === "number" ? item.duration : existing?.duration,
          });
        }
      }
    }
  }

  if (job.result && typeof job.result === "object" && "items" in job.result) {
    const resItems = (job.result as { items?: unknown[] }).items;
    if (Array.isArray(resItems)) {
      for (const item of resItems) {
        if (item && typeof item === "object") {
          const p = item as Record<string, unknown>;
          const idx = typeof p.index === "number" ? p.index : (typeof p.id === "string" ? p.id : null);
          if (idx != null) {
            const rawTitle = String(p.title || p.name || p.url || `#${Number(idx) + 1}`);
            const status = (p.status as SubtaskAction["status"]) || "done";
            items.set(idx, {
              id: idx,
              title: rawTitle,
              url: typeof p.url === "string" && p.url ? p.url : items.get(idx)?.url,
              status,
              percent: status === "done" ? 100 : undefined,
              error: p.error ? String(p.error) : undefined,
              size: typeof p.size === "number" ? p.size : undefined,
              duration: typeof p.duration === "number" ? p.duration : undefined,
            });
          }
        }
      }
    }
  }

  if (items.size === 0 && job.status !== "running") {
    job.meta?.urls?.forEach((url, index) => items.set(index, { id: index, title: url, url, status: "unknown" }));
  }

  runningItems(job).forEach((run, index) => {
    const cur = items.get(index);
    if (!cur) return;
    items.set(index, {
      ...cur,
      status: "running",
      percent: run.percent,
      speed: run.speed,
      eta: run.eta,
      size: run.total && run.total > 0 ? run.total : (run.downloaded ?? cur.size),
    });
  });

  const position = new Map(queueOrder(job)?.map((index, at) => [index, at]));
  const list = Array.from(items.values());
  list.sort((a, b) => {
    const pa = typeof a.id === "number" ? (position.get(a.id) ?? Infinity) : Infinity;
    const pb = typeof b.id === "number" ? (position.get(b.id) ?? Infinity) : Infinity;
    if (pa !== pb) return pa - pb;
    if (typeof a.id === "number" && typeof b.id === "number") return a.id - b.id;
    return String(a.id).localeCompare(String(b.id));
  });

  return list;
}

export interface RunningItem {
  index: number;
  percent: number;
  speed?: number;
  eta?: number;
  downloaded?: number;
  total?: number;
}

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

/** The links a running queue downloads right now, by index, from its last progress event. */
export function runningItems(job: JobState | null | undefined): Map<number, RunningItem> {
  const running = new Map<number, RunningItem>();
  if (job?.status !== "running" || !Array.isArray(job.extra?.running)) return running;
  for (const raw of job.extra.running as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const index = num(item.index);
    if (index == null) continue;
    running.set(index, {
      index,
      percent: num(item.percent) ?? 0,
      speed: num(item.speed),
      eta: num(item.eta),
      downloaded: num(item.downloaded),
      total: num(item.total),
    });
  }
  return running;
}

/** The order (item indexes) a queue shows its links in, once it has reported one. */
export function queueOrder(job: JobState | null | undefined): number[] | undefined {
  const order = job?.extra?.order;
  return Array.isArray(order) && order.every((index) => typeof index === "number") ? order : undefined;
}

/** The links a job downloaded from: its one link, or every link of its queue. */
export function jobLinks(job: JobState, subtasks: SubtaskAction[]): string[] {
  if (job.meta?.url) return [job.meta.url];
  const fromItems = subtasks.map((s) => s.url).filter((url): url is string => !!url);
  return [...new Set(fromItems.length > 0 ? fromItems : (job.meta?.urls ?? []))];
}

/** Where "Show in folder" points: a saved file or the output folder, never an unsaved preview (resultPath). */
export function revealTarget(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const files = Array.isArray(r.files) ? r.files : [];
  const candidates = [r.outPath, r.path, files[0], r.outputDir, r.outDir, r.outdir];
  return candidates.find((c): c is string => typeof c === "string" && c !== "") ?? null;
}

/** The one file a job wrote, for "Open file"; null for several files, a folder or an unsaved preview. */
export function openTarget(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const files = Array.isArray(r.files) ? r.files.filter((f): f is string => typeof f === "string" && f !== "") : [];
  if (files.length > 1) return null;
  return [r.outPath, r.path, files[0]].find((c): c is string => typeof c === "string" && c !== "") ?? null;
}

/** Files offered in "Send to": the job's output, including an unsaved preview (resultPath). */
export function transferTargets(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  for (const single of [r.outPath, r.resultPath, r.path]) {
    if (typeof single === "string" && single) return [single];
  }
  if (Array.isArray(r.files) && r.files.length > 0 && typeof r.files[0] === "string") return r.files as string[];
  return [];
}
