import { create } from "zustand";
import { api } from "../lib/bridge";
import type { EngineInfo } from "../lib/types";

interface EnginesState {
  engines: EngineInfo[] | null;
  /** The running or last update job; EngineUpdateHost reports its outcome. */
  jobId: string | null;
  checking: boolean;
  load: () => Promise<void>;
  check: () => Promise<void>;
  update: () => Promise<void>;
  reset: () => Promise<void>;
}

export const useEngines = create<EnginesState>((set) => ({
  engines: null,
  jobId: null,
  checking: false,
  load: async () => {
    set({ engines: await api.system.engines() });
  },
  check: async () => {
    set({ checking: true });
    try {
      set({ engines: await api.system.checkEngines() });
    } finally {
      set({ checking: false });
    }
  },
  update: async () => {
    set({ jobId: await api.system.updateEngines() });
  },
  reset: async () => {
    set({ engines: await api.system.resetEngines() });
  },
}));
