import { create } from "zustand";
import { api } from "../lib/bridge";
import type { Settings } from "../lib/types";

interface SettingsState {
  settings: Settings | null;
  load: () => Promise<Settings>;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  load: async () => {
    const settings = await api.settings.get();
    set({ settings });
    return settings;
  },
  update: async (patch) => {
    // Optimistic: theme/language switches must feel instant.
    const previous = get().settings;
    if (previous) set({ settings: { ...previous, ...patch } as Settings });
    try {
      set({ settings: await api.settings.update(patch) });
    } catch (err) {
      set({ settings: previous });
      throw err;
    }
  },
}));
