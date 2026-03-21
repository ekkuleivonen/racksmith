import { create } from "zustand";

type AiChatUiState = {
  panelOpen: boolean;
  dockEngaged: boolean;
  setPanelOpen: (open: boolean) => void;
  engageDock: () => void;
  disengageDock: () => void;
};

export const useAiChatUiStore = create<AiChatUiState>((set) => ({
  panelOpen: false,
  dockEngaged: false,
  setPanelOpen: (panelOpen) => set({ panelOpen, ...(panelOpen ? { dockEngaged: true } : {}) }),
  engageDock: () => set({ dockEngaged: true, panelOpen: true }),
  disengageDock: () => set({ dockEngaged: false, panelOpen: false }),
}));
