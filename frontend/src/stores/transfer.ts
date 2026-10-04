import { create } from "zustand";

export interface TransferPayload {
  files: string[];
  sourceToolId?: string;
  targetToolId: string;
  targetSubTab?: string;
  timestamp: number;
}

interface TransferStore {
  // Modal state
  isModalOpen: boolean;
  modalFiles: string[];
  sourceToolId?: string;
  openModal: (files: string | string[], sourceToolId?: string) => void;
  closeModal: () => void;

  // Pending transfer payload
  pendingTransfer: TransferPayload | null;
  sendToTool: (targetToolId: string, files: string[], targetSubTab?: string) => void;
  consumeTransfer: (toolId: string) => TransferPayload | null;
}

export const useTransferStore = create<TransferStore>((set, get) => ({
  isModalOpen: false,
  modalFiles: [],
  sourceToolId: undefined,

  openModal: (files, sourceToolId) => {
    const list = Array.isArray(files) ? files.filter(Boolean) : files ? [files] : [];
    if (!list.length) return;
    set({
      isModalOpen: true,
      modalFiles: list,
      sourceToolId,
    });
  },

  closeModal: () => {
    set({
      isModalOpen: false,
      modalFiles: [],
      sourceToolId: undefined,
    });
  },

  pendingTransfer: null,

  sendToTool: (targetToolId, files, targetSubTab) => {
    set((s) => ({
      pendingTransfer: {
        files,
        sourceToolId: s.sourceToolId,
        targetToolId,
        targetSubTab,
        timestamp: Date.now(),
      },
      isModalOpen: false,
      modalFiles: [],
      sourceToolId: undefined,
    }));
  },

  consumeTransfer: (toolId) => {
    const current = get().pendingTransfer;
    if (current && current.targetToolId === toolId) {
      set({ pendingTransfer: null });
      return current;
    }
    return null;
  },
}));
