import { create } from "zustand";

type AiChatUiState = {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
};

export const useAiChatUiStore = create<AiChatUiState>((set) => ({
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
}));
