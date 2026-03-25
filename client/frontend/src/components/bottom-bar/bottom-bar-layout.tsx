import { type ReactNode, useEffect } from "react";
import { usePanelRef } from "react-resizable-panels";
import {
  ChevronUp,
  Play,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { UnifiedBottomPanel } from "@/components/bottom-bar/unified-bottom-panel";
import { useBottomBarStore, type BottomTab } from "@/stores/bottom-bar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useSetupStore } from "@/stores/setup";
import { cn } from "@/lib/utils";
import { writeOpenChatIds } from "@/lib/ai-chat-storage";
import { deleteAiChat } from "@/lib/ai-chat";

function tabKindIcon(tab: BottomTab) {
  switch (tab.kind) {
    case "ssh":
      return <Terminal className="size-3 text-zinc-500 shrink-0" />;
    case "ai-chat":
      return <Sparkles className="size-3 text-violet-400 shrink-0" />;
    case "playbook-run":
      return <Play className="size-3 text-emerald-500/90 shrink-0" />;
    default: {
      const _e: never = tab;
      return _e;
    }
  }
}

function BottomMinimizedBar() {
  const queryClient = useQueryClient();
  const status = useSetupStore((s) => s.status);
  const userId = status?.user?.id ?? "";
  const repoFull = status?.repo?.full_name ?? "";
  const repoReady = Boolean(status?.repo_ready && userId && repoFull);

  const tabs = useBottomBarStore((s) => s.tabs);
  const activeTabId = useBottomBarStore((s) => s.activeTabId);
  const setActiveTab = useBottomBarStore((s) => s.setActiveTab);
  const closeAllTabs = useBottomBarStore((s) => s.closeAllTabs);
  const panelOpen = useBottomBarStore((s) => s.panelOpen);
  const setPanelOpen = useBottomBarStore((s) => s.setPanelOpen);

  const minimized = tabs.length > 0 && !panelOpen;

  if (!minimized) return null;

  const expand = (tabId?: string) => {
    if (tabId) setActiveTab(tabId);
    setPanelOpen(true);
  };

  const handleCloseAllTabs = () => {
    void (async () => {
      const allTabs = useBottomBarStore.getState().tabs;
      const aiTabs = allTabs.filter(
        (t): t is Extract<BottomTab, { kind: "ai-chat" }> => t.kind === "ai-chat",
      );
      for (const t of aiTabs) {
        try {
          await deleteAiChat(t.chatId);
        } catch {
          /* */
        }
        queryClient.removeQueries({ queryKey: ["ai-chat-messages", t.chatId] });
      }
      if (repoReady) writeOpenChatIds(userId, repoFull, []);
      closeAllTabs();
    })();
  };

  return (
    <div className="flex items-center h-8 bg-[#09090b] border-t border-zinc-700/60 px-2 gap-1 shrink-0">
      <div className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-hide flex-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => expand(tab.id)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-sm transition-colors truncate max-w-[140px] shrink-0",
              tab.id === activeTabId
                ? "bg-zinc-800 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50",
            )}
          >
            {tabKindIcon(tab)}
            <span className="truncate">
              {tab.kind === "playbook-run" ? tab.playbookName : tab.label}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="size-5 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
        onClick={() => expand()}
        aria-label="Expand bottom panel"
      >
        <ChevronUp className="size-3" />
      </button>
      <button
        type="button"
        className="size-5 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
        onClick={handleCloseAllTabs}
        aria-label="Close all tabs"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

type BottomBarLayoutProps = {
  children: ReactNode;
};

/**
 * Vertical split: main content on top, unified bottom bar when tabs exist.
 * Used in AppShell (non-home routes) and embedded in HostsCanvas (left column only).
 */
export function BottomBarLayout({ children }: BottomBarLayoutProps) {
  const tabs = useBottomBarStore((s) => s.tabs);
  const panelOpen = useBottomBarStore((s) => s.panelOpen);

  const hasBottomDock = tabs.length > 0;
  const bottomExpanded = hasBottomDock && panelOpen;

  const bottomPanelRef = usePanelRef();

  useEffect(() => {
    if (!hasBottomDock) return;
    const panel = bottomPanelRef.current;
    if (!panel) return;
    if (bottomExpanded) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [bottomExpanded, hasBottomDock, bottomPanelRef]);

  if (!hasBottomDock) {
    return <>{children}</>;
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={60} minSize={15}>
          {children}
        </ResizablePanel>
        <ResizableHandle className="bg-zinc-700/50 hover:bg-zinc-600/50 transition-colors" />
        <ResizablePanel
          panelRef={bottomPanelRef}
          defaultSize={40}
          minSize={10}
          collapsible
          collapsedSize={0}
          onResize={(size) => {
            const collapsed = size.asPercentage === 0;
            if (collapsed) {
              if (useBottomBarStore.getState().panelOpen) {
                useBottomBarStore.setState({ panelOpen: false });
              }
            } else if (!useBottomBarStore.getState().panelOpen) {
              useBottomBarStore.setState({ panelOpen: true });
            }
          }}
        >
          <UnifiedBottomPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
      <BottomMinimizedBar />
    </div>
  );
}
