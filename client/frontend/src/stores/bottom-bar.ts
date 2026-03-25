import { create } from "zustand";

export type BottomTab =
  | { kind: "ssh"; id: string; hostId: string; label: string }
  | { kind: "ai-chat"; id: string; chatId: string; label: string }
  | {
      kind: "playbook-run";
      id: string;
      runId: string;
      playbookName: string;
      /** PlaybookRun.status from API */
      status: string;
    };

type BottomBarState = {
  tabs: BottomTab[];
  activeTabId: string | null;
  panelOpen: boolean;
  openSshSession: (hostId: string, label: string) => void;
  openAiChatTab: (chatId: string, label?: string) => void;
  openPlaybookRunTab: (run: {
    runId: string;
    playbookName: string;
    status: string;
  }) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  togglePanel: () => void;
  closePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  closeAllTabs: () => void;
  updatePlaybookRunTab: (
    runId: string,
    patch: Partial<Pick<BottomTab & { kind: "playbook-run" }, "status" | "playbookName">>,
  ) => void;
};

export const useBottomBarStore = create<BottomBarState>((set) => ({
  tabs: [],
  activeTabId: null,
  panelOpen: false,

  openSshSession: (hostId, label) =>
    set((s) => {
      const existing = s.tabs.find(
        (t): t is Extract<BottomTab, { kind: "ssh" }> =>
          t.kind === "ssh" && t.hostId === hostId,
      );
      if (existing) {
        return { activeTabId: existing.id, panelOpen: true };
      }
      const tab: BottomTab = {
        kind: "ssh",
        id: crypto.randomUUID(),
        hostId,
        label,
      };
      return {
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        panelOpen: true,
      };
    }),

  openAiChatTab: (chatId, label) =>
    set((s) => {
      const existing = s.tabs.find(
        (t): t is Extract<BottomTab, { kind: "ai-chat" }> =>
          t.kind === "ai-chat" && t.chatId === chatId,
      );
      const shortLabel = label ?? `${chatId.slice(0, 8)}…`;
      if (existing) {
        return {
          activeTabId: existing.id,
          panelOpen: true,
          tabs: s.tabs.map((t) =>
            t.kind === "ai-chat" && t.chatId === chatId && label
              ? { ...t, label: shortLabel }
              : t,
          ),
        };
      }
      const tab: BottomTab = {
        kind: "ai-chat",
        id: crypto.randomUUID(),
        chatId,
        label: shortLabel,
      };
      return {
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        panelOpen: true,
      };
    }),

  openPlaybookRunTab: ({ runId, playbookName, status }) =>
    set((s) => {
      const existing = s.tabs.find(
        (t): t is Extract<BottomTab, { kind: "playbook-run" }> =>
          t.kind === "playbook-run" && t.runId === runId,
      );
      if (existing) {
        return {
          activeTabId: existing.id,
          panelOpen: true,
          tabs: s.tabs.map((t) =>
            t.kind === "playbook-run" && t.runId === runId
              ? { ...t, playbookName, status }
              : t,
          ),
        };
      }
      const tab: BottomTab = {
        kind: "playbook-run",
        id: crypto.randomUUID(),
        runId,
        playbookName,
        status,
      };
      return {
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        panelOpen: true,
      };
    }),

  closeTab: (tabId) =>
    set((s) => {
      const removedIdx = s.tabs.findIndex((t) => t.id === tabId);
      if (removedIdx === -1) return s;
      const next = s.tabs.filter((t) => t.id !== tabId);
      let activeTabId = s.activeTabId;
      if (next.length === 0) {
        activeTabId = null;
      } else if (
        activeTabId === tabId ||
        !activeTabId ||
        !next.some((t) => t.id === activeTabId)
      ) {
        const i = Math.min(Math.max(0, removedIdx), next.length - 1);
        activeTabId = next[i]!.id;
      }
      return {
        tabs: next,
        activeTabId,
        panelOpen: next.length > 0 ? s.panelOpen : false,
      };
    }),

  setActiveTab: (tabId) =>
    set((s) => (s.tabs.some((t) => t.id === tabId) ? { activeTabId: tabId } : {})),

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  closePanel: () => set({ panelOpen: false }),

  setPanelOpen: (panelOpen) => set({ panelOpen }),

  closeAllTabs: () =>
    set({
      tabs: [],
      activeTabId: null,
      panelOpen: false,
    }),

  updatePlaybookRunTab: (runId, patch) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.kind === "playbook-run" && t.runId === runId
          ? { ...t, ...patch }
          : t,
      ),
    })),
}));
