// Search, filters and day groups for the History tab of the jobs popup.

import { fileName } from "../lib/format";
import type { HistoryEntry } from "../lib/types";
import { toolForJob } from "./tools";

export const ALL = "all";

export interface HistoryFilter {
  query: string;
  /** A tool id, or ALL. */
  tool: string;
  /** A job status, or ALL. */
  status: HistoryEntry["status"] | typeof ALL;
}

export const EMPTY_FILTER: HistoryFilter = { query: "", tool: ALL, status: ALL };

// "ł" has no decomposed form, so NFD alone would not match it with "l".
const normalize = (s: string) =>
  s.toLocaleLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ł/g, "l");

const searchedLinks = (entry: HistoryEntry) => [
  entry.meta?.url ?? "",
  ...(entry.meta?.urls ?? []),
  ...(entry.items ?? []).flatMap((item) => [item.url ?? "", item.title ?? ""]),
];

/** Entries matching the filter; the query is looked up in the shown title, the output file names and the links. */
export function filterHistory(entries: HistoryEntry[], filter: HistoryFilter, title: (entry: HistoryEntry) => string) {
  const query = normalize(filter.query.trim());
  return entries.filter((entry) => {
    if (filter.tool !== ALL && toolForJob(entry.kind)?.id !== filter.tool) return false;
    if (filter.status !== ALL && entry.status !== filter.status) return false;
    if (!query) return true;
    return normalize([title(entry), ...entry.outputs.map(fileName), ...searchedLinks(entry)].join("\n")).includes(query);
  });
}

/** The tools and statuses present in the history, for the filter pickers. */
export function historyFacets(entries: HistoryEntry[]) {
  const tools = new Set<string>();
  const statuses = new Set<HistoryEntry["status"]>();
  for (const entry of entries) {
    const tool = toolForJob(entry.kind);
    if (tool) tools.add(tool.id);
    statuses.add(entry.status);
  }
  return { tools: [...tools], statuses: [...statuses] };
}

export interface DayGroup<T> {
  /** "today", "yesterday", or the local date as YYYY-MM-DD. */
  day: string;
  /** Midnight of that day, for formatting the heading. */
  date: Date;
  entries: T[];
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Entries (newest first) split into local days by when they finished, or started when they never finished. */
export function groupByDay<T extends { startedAt: number; finishedAt: number | null }>(entries: T[], now = new Date()): DayGroup<T>[] {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups: DayGroup<T>[] = [];
  for (const entry of entries) {
    const when = new Date((entry.finishedAt ?? entry.startedAt) * 1000);
    const key = dayKey(when);
    const day = key === today ? "today" : key === yesterday ? "yesterday" : key;
    const last = groups[groups.length - 1];
    if (last?.day === day) last.entries.push(entry);
    else groups.push({ day, date: new Date(when.getFullYear(), when.getMonth(), when.getDate()), entries: [entry] });
  }
  return groups;
}
