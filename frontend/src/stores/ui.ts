import { create } from "zustand";

interface UiState {
  jobsOpen: boolean;
  paletteOpen: boolean;
  /** Windows 11 Mica backdrop is active (window base must stay transparent). */
  mica: boolean;
  micaSupported: boolean;
  setJobsOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  jobsOpen: false,
  paletteOpen: false,
  mica: false,
  micaSupported: false,
  setJobsOpen: (jobsOpen) => set({ jobsOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
