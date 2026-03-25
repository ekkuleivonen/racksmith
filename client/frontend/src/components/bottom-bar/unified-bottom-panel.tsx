import { useState } from "react";
import {
  Minus,
  Play,
  Plus,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AddTabHostPicker, SshTerminalPane } from "@/components/canvas/ssh-bottom-panel";
import { AiChatContent } from "@/components/ai/racksmith-ai-panel";
import { PlaybookRunContent } from "@/components/bottom-bar/playbook-run-content";
import { useSetupStore } from "@/stores/setup";
import {
  useBottomBarStore,
  type BottomTab,
} from "@/stores/bottom-bar";
import {
  readOpenChatIds,
  writeOpenChatIds,
} from "@/lib/ai-chat-storage";
import { createAiChat, deleteAiChat } from "@/lib/ai-chat";
import { toastApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

function tabIcon(tab: BottomTab) {
  switch (tab.kind) {
    case "ssh":
      return <Terminal className="size-2.5 text-zinc-500 shrink-0" />;
    case "ai-chat":
      return <Sparkles className="size-2.5 text-violet-400 shrink-0" />;
    case "playbook-run":
      return <Play className="size-2.5 text-emerald-500/90 shrink-0" />;
    default: {
      const _e: never = tab;
      return _e;
    }
  }
}

export function UnifiedBottomPanel() {
  const queryClient = useQueryClient();
  const status = useSetupStore((s) => s.status);
  const userId = status?.user?.id ?? "";
  const repoFull = status?.repo?.full_name ?? "";
  const repoReady = Boolean(status?.repo_ready && userId && repoFull);

  const tabs = useBottomBarStore((s) => s.tabs);
  const activeTabId = useBottomBarStore((s) => s.activeTabId);
  const setActiveTab = useBottomBarStore((s) => s.setActiveTab);
  const closeTab = useBottomBarStore((s) => s.closeTab);
  const openSshSession = useBottomBarStore((s) => s.openSshSession);
  const openAiChatTab = useBottomBarStore((s) => s.openAiChatTab);
  const closePanel = useBottomBarStore((s) => s.closePanel);
  const closeAllTabs = useBottomBarStore((s) => s.closeAllTabs);

  const [addOpen, setAddOpen] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null;

  const persistChatIds = (nextIds: string[]) => {
    if (repoReady) writeOpenChatIds(userId, repoFull, nextIds);
  };

  const handleCloseTab = async (tab: BottomTab) => {
    if (tab.kind === "ai-chat") {
      try {
        await deleteAiChat(tab.chatId);
      } catch {
        /* still remove */
      }
      const next = readOpenChatIds(userId, repoFull).filter(
        (id) => id !== tab.chatId,
      );
      persistChatIds(next);
      queryClient.removeQueries({ queryKey: ["ai-chat-messages", tab.chatId] });
    }
    closeTab(tab.id);
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

  const handleNewAiChat = async () => {
    if (!repoReady) return;
    try {
      const { chat_id } = await createAiChat();
      const ids = [...readOpenChatIds(userId, repoFull), chat_id];
      persistChatIds(ids);
      openAiChatTab(chat_id, `${chat_id.slice(0, 8)}…`);
      await queryClient.invalidateQueries({ queryKey: ["ai-chat-messages", chat_id] });
    } catch (e) {
      toastApiError(e, "Could not create chat");
    }
    setAddOpen(false);
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b] shadow-[0_-6px_16px_rgba(0,0,0,0.5)]">
      <div className="flex items-center border-b border-zinc-800/60 shrink-0">
        <div className="flex-1 flex items-center min-w-0 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "group flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium tracking-wide border-r border-zinc-800/60 shrink-0 transition-colors",
                tab.id === activeTab?.id
                  ? "bg-zinc-900 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50",
              )}
            >
              {tabIcon(tab)}
              <span className="truncate max-w-[120px]">
                {tab.kind === "playbook-run" ? tab.playbookName : tab.label}
              </span>
              <span
                role="button"
                tabIndex={0}
                className="size-3.5 flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCloseTab(tab);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    void handleCloseTab(tab);
                  }
                }}
              >
                <X className="size-2.5" />
              </span>
            </button>
          ))}
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center px-2 py-1.5 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                aria-label="Add tab"
              >
                <Plus className="size-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-56 p-2 space-y-2">
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">
                New SSH session
              </p>
              <AddTabHostPicker
                onSelect={(hostId, label) => {
                  setAddOpen(false);
                  openSshSession(hostId, label);
                }}
              />
              <div className="border-t border-zinc-800 pt-2">
                <button
                  type="button"
                  disabled={!repoReady}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-violet-300 hover:bg-zinc-800 rounded-sm disabled:opacity-50"
                  onClick={() => void handleNewAiChat()}
                >
                  <Sparkles className="size-3" />
                  New AI chat
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-zinc-500 hover:text-zinc-300 shrink-0"
          aria-label="Minimize bottom panel"
          onClick={closePanel}
        >
          <Minus className="size-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-zinc-500 hover:text-zinc-300 mr-1 shrink-0"
          aria-label="Close all tabs"
          onClick={handleCloseAllTabs}
        >
          <X className="size-3" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 relative">
        <div className={cn("h-full min-h-0 px-1 pb-1", activeTab?.kind !== "ssh" && "hidden")}>
          {tabs
            .filter((t): t is Extract<BottomTab, { kind: "ssh" }> => t.kind === "ssh")
            .map((t) => (
              <SshTerminalPane
                key={t.id}
                hostId={t.hostId}
                visible={t.id === activeTab?.id}
              />
            ))}
        </div>
        {tabs
          .filter((t): t is Extract<BottomTab, { kind: "ai-chat" }> => t.kind === "ai-chat")
          .map((t) => (
            <div key={t.id} className={cn("h-full", t.id !== activeTab?.id && "hidden")}>
              <AiChatContent chatId={t.chatId} />
            </div>
          ))}
        {tabs
          .filter((t): t is Extract<BottomTab, { kind: "playbook-run" }> => t.kind === "playbook-run")
          .map((t) => (
            <div key={t.id} className={cn("h-full", t.id !== activeTab?.id && "hidden")}>
              <PlaybookRunContent
                runId={t.runId}
                playbookName={t.playbookName}
                status={t.status}
              />
            </div>
          ))}
        {!activeTab && (
          <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
            No tab selected
          </div>
        )}
      </div>
    </div>
  );
}
