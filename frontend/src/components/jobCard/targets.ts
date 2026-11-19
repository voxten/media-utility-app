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

  if (job.status === "running" && typeof job.extra?.item === "number") {
    const curIdx = job.extra.item;
    const cur = items.get(curIdx);
    if (cur) {
      items.set(curIdx, {
        ...cur,
        status: "running",
        percent: typeof job.extra.itemPercent === "number" ? job.extra.itemPercent : cur.percent,
        speed: typeof job.extra.speed === "number" ? job.extra.speed : undefined,
        eta: typeof job.extra.eta === "number" ? job.extra.eta : undefined,
        size: typeof job.extra.total === "number" && job.extra.total > 0 ? job.extra.total : (typeof job.extra.downloaded === "number" ? job.extra.downloaded : cur.size),
      });
    }
  }

  const list = Array.from(items.values());
  list.sort((a, b) => {
    if (typeof a.id === "number" && typeof b.id === "number") return a.id - b.id;
    return String(a.id).localeCompare(String(b.id));
  });

  return list;
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
