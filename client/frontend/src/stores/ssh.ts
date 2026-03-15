import { create } from "zustand";

export type SshTab = {
  id: string;
  hostId: string;
  label: string;
};

type SshState = {
  tabs: SshTab[];
  activeTabId: string | null;
  panelOpen: boolean;
  openSession: (hostId: string, label: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  togglePanel: () => void;
  closePanel: () => void;
  closeAllSessions: () => void;
};

export const useSshStore = create<SshState>((set) => ({
  tabs: [],
  activeTabId: null,
  panelOpen: false,

  openSession: (hostId, label) =>
    set((s) => {
      const existing = s.tabs.find((t) => t.hostId === hostId);
      if (existing) {
        return { activeTabId: existing.id, panelOpen: true };
      }
      const tab: SshTab = { id: crypto.randomUUID(), hostId, label };
      return {
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        panelOpen: true,
      };
    }),

  closeTab: (tabId) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return s;
      const next = s.tabs.filter((t) => t.id !== tabId);
      if (next.length === 0) {
        return { tabs: [], activeTabId: null, panelOpen: false };
      }
      const needNewActive = s.activeTabId === tabId;
      const activeTabId = needNewActive
        ? next[Math.min(idx, next.length - 1)].id
        : s.activeTabId;
      return { tabs: next, activeTabId };
    }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  closePanel: () => set({ panelOpen: false }),

  closeAllSessions: () => set({ tabs: [], activeTabId: null, panelOpen: false }),
}));
