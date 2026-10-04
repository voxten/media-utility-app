import { create } from "zustand";

interface UiState {
  jobsOpen: boolean;
  jobsPopupOpen: boolean;
  paletteOpen: boolean;
  /** Windows 11 Mica backdrop is active (window base must stay transparent). */
  mica: boolean;
  micaSupported: boolean;
  setJobsOpen: (open: boolean) => void;
  setJobsPopupOpen: (open: boolean) => void;
  toggleJobsPopup: () => void;
  setPaletteOpen: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  jobsOpen: false,
  jobsPopupOpen: false,
  paletteOpen: false,
  mica: false,
  micaSupported: false,
  setJobsOpen: (jobsOpen) => set({ jobsOpen }),
  setJobsPopupOpen: (jobsPopupOpen) => set({ jobsPopupOpen }),
  toggleJobsPopup: () => set((s) => ({ jobsPopupOpen: !s.jobsPopupOpen })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
