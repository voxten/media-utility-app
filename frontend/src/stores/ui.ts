import { create } from "zustand";

interface UiState {
  jobsOpen: boolean;
  paletteOpen: boolean;
  setJobsOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  jobsOpen: false,
  paletteOpen: false,
  setJobsOpen: (jobsOpen) => set({ jobsOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
