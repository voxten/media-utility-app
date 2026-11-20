import { create } from "zustand";

export type JobsTab = "now" | "history";

interface UiState {
  jobsPopupOpen: boolean;
  /** The jobs popup's tab, kept for the session. */
  jobsTab: JobsTab;
  paletteOpen: boolean;
  /** Windows 11 Mica backdrop is active (window base must stay transparent). */
  mica: boolean;
  micaSupported: boolean;
  /** The global shortcut another program owns ("" when none): the saved one at start-up or a refused choice. */
  hotkeyTaken: string;
  setJobsPopupOpen: (open: boolean) => void;
  setJobsTab: (tab: JobsTab) => void;
  toggleJobsPopup: () => void;
  setPaletteOpen: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  jobsPopupOpen: false,
  jobsTab: "now",
  paletteOpen: false,
  mica: false,
  micaSupported: false,
  hotkeyTaken: "",
  setJobsPopupOpen: (jobsPopupOpen) => set({ jobsPopupOpen }),
  setJobsTab: (jobsTab) => set({ jobsTab }),
  toggleJobsPopup: () => set((s) => ({ jobsPopupOpen: !s.jobsPopupOpen })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
