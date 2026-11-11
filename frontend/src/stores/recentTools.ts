// Tools the user opened most recently, newest first, for the shortcuts on the Home page.
// Kept in localStorage: it is a per-machine convenience, nothing breaks when it is empty.

import { create } from "zustand";

const STORAGE_KEY = "recent-tools";
export const RECENT_TOOLS_LIMIT = 6;

/** Moves `id` to the front, without duplicates, keeping at most `limit` entries. */
export function pushRecent(list: string[], id: string, limit = RECENT_TOOLS_LIMIT): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, limit);
}

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

interface RecentToolsState {
  ids: string[];
  remember: (id: string) => void;
}

export const useRecentTools = create<RecentToolsState>((set, get) => ({
  ids: read(),
  remember: (id) => {
    const ids = pushRecent(get().ids, id);
    if (ids.join() === get().ids.join()) return;
    set({ ids });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* storage unavailable */
    }
  },
}));
