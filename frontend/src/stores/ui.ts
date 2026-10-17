import { create } from "zustand";

interface UiState {
  jobsPopupOpen: boolean;
  paletteOpen: boolean;
  /** Windows 11 Mica backdrop is active (window base must stay transparent). */
  mica: boolean;
  micaSupported: boolean;
  setJobsPopupOpen: (open: boolean) => void;
  toggleJobsPopup: () => void;
  setPaletteOpen: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  jobsPopupOpen: false,
  paletteOpen: false,
  mica: false,
  micaSupported: false,
  setJobsPopupOpen: (jobsPopupOpen) => set({ jobsPopupOpen }),
  toggleJobsPopup: () => set((s) => ({ jobsPopupOpen: !s.jobsPopupOpen })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
