import { create } from "zustand";
import { api } from "../lib/bridge";

export type JobsTab = "now" | "history";

interface UiState {
  jobsPopupOpen: boolean;
  /** The jobs popup's tab, kept for the session. */
  jobsTab: JobsTab;
  paletteOpen: boolean;
  /** Windows 11 Mica backdrop is active (window base must stay transparent). */
  mica: boolean;
  micaSupported: boolean;
  /** The Windows accent colour as #rrggbb; null until read or when Windows gives none. */
  systemAccent: string | null;
  /** The global shortcut another program owns ("" when none): the saved one at start-up or a refused choice. */
  hotkeyTaken: string;
  setJobsPopupOpen: (open: boolean) => void;
  setJobsTab: (tab: JobsTab) => void;
  toggleJobsPopup: () => void;
  setPaletteOpen: (open: boolean) => void;
  /** Reads the Windows accent again, e.g. when the window comes back after the user changed it. */
  refreshSystemAccent: () => Promise<void>;
}

export const useUi = create<UiState>((set) => ({
  jobsPopupOpen: false,
  jobsTab: "now",
  paletteOpen: false,
  mica: false,
  micaSupported: false,
  systemAccent: null,
  hotkeyTaken: "",
  setJobsPopupOpen: (jobsPopupOpen) => set({ jobsPopupOpen }),
  setJobsTab: (jobsTab) => set({ jobsTab }),
  toggleJobsPopup: () => set((s) => ({ jobsPopupOpen: !s.jobsPopupOpen })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  refreshSystemAccent: async () => {
    const systemAccent = await api.app.systemAccent().catch(() => null);
    set({ systemAccent: systemAccent && /^#[0-9a-f]{6}$/i.test(systemAccent) ? systemAccent : null });
  },
}));
