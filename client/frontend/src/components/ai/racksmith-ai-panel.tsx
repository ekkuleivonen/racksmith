import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquarePlus, Plus, Send, Sparkles, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSetupStore } from "@/stores/setup";
import { useAiChatUiStore } from "@/stores/ai-chat-ui";
import {
  readOpenChatIds,
  writeOpenChatIds,
} from "@/lib/ai-chat-storage";
import {
  createAiChat,
  deleteAiChat,
  getAiChatMessages,
  streamAiChatTurn,
  type ChatStreamContext,
} from "@/lib/ai-chat";
import { useHosts, usePlaybooks, useRoles } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";

function useRepoScope() {
  const status = useSetupStore((s) => s.status);
  const userId = status?.user?.id ?? "";
  const repoFull = status?.repo?.full_name ?? "";
  return { userId, repoFull, repoReady: Boolean(status?.repo_ready && userId && repoFull) };
}

export function RacksmithAiPanel() {
  const panelOpen = useAiChatUiStore((s) => s.panelOpen);
  const setPanelOpen = useAiChatUiStore((s) => s.setPanelOpen);
  const { userId, repoFull, repoReady } = useRepoScope();
  const queryClient = useQueryClient();

  const [openChatIds, setOpenChatIds] = useState<string[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [liveSteps, setLiveSteps] = useState<string[]>([]);
  const [context, setContext] = useState<ChatStreamContext>({});

  const { data: hosts = [] } = useHosts();
  const { data: playbooks = [] } = usePlaybooks();
  const { data: roles = [] } = useRoles();

  useEffect(() => {
    if (!panelOpen || !repoReady) return;
    const ids = readOpenChatIds(userId, repoFull);
    setOpenChatIds(ids);
    setActiveChatId((cur) => {
      if (cur && ids.includes(cur)) return cur;
      return ids[0] ?? null;
    });
  }, [panelOpen, repoReady, userId, repoFull]);

  const ensureChat = useCallback(async () => {
    if (!repoReady) return;
    let ids = readOpenChatIds(userId, repoFull);
    if (ids.length === 0) {
      try {
        const { chat_id } = await createAiChat();
        ids = [chat_id];
        writeOpenChatIds(userId, repoFull, ids);
        setOpenChatIds(ids);
        setActiveChatId(chat_id);
      } catch (e) {
        toastApiError(e, "Could not start chat");
      }
      return;
    }
    if (!activeChatId || !ids.includes(activeChatId)) {
      setActiveChatId(ids[0]);
    }
  }, [repoReady, userId, repoFull, activeChatId]);

  useEffect(() => {
    if (panelOpen && repoReady) {
      void ensureChat();
    }
  }, [panelOpen, repoReady, ensureChat]);

  const messagesQuery = useQuery({
    queryKey: ["ai-chat-messages", activeChatId],
    queryFn: () => getAiChatMessages(activeChatId!),
    enabled: Boolean(activeChatId && panelOpen && repoReady),
  });

  const persistOpenIds = useCallback(
    (ids: string[]) => {
      setOpenChatIds(ids);
      if (repoReady) writeOpenChatIds(userId, repoFull, ids);
    },
    [repoReady, userId, repoFull],
  );

  const handleNewChat = async () => {
    if (!repoReady) return;
    try {
      const { chat_id } = await createAiChat();
      const next = [...openChatIds, chat_id];
      persistOpenIds(next);
      setActiveChatId(chat_id);
      await queryClient.invalidateQueries({ queryKey: ["ai-chat-messages", chat_id] });
    } catch (e) {
      toastApiError(e, "Could not create chat");
    }
  };

  const handleCloseChat = async (chatId: string) => {
    try {
      await deleteAiChat(chatId);
    } catch {
      /* still drop from UI */
    }
    const next = openChatIds.filter((id) => id !== chatId);
    persistOpenIds(next);
    queryClient.removeQueries({ queryKey: ["ai-chat-messages", chatId] });
    if (activeChatId === chatId) {
      setActiveChatId(next[0] ?? null);
    }
    if (next.length === 0 && repoReady) {
      try {
        const { chat_id } = await createAiChat();
        persistOpenIds([chat_id]);
        setActiveChatId(chat_id);
      } catch {
        /* ignore */
      }
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeChatId || sending) return;
    setInput("");
    setSending(true);
    setLiveSteps([]);
    const controller = new AbortController();
    try {
      const res = await streamAiChatTurn(
        activeChatId,
        { content: text, context },
        controller.signal,
      );
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload) as { type?: string; text?: string; message?: string };
            if (ev.type === "thinking" && ev.text) {
              setLiveSteps((s) => [...s, ev.text!]);
            }
            if (ev.type === "error" && ev.message) {
              toast.error(ev.message);
            }
          } catch {
            /* ignore */
          }
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["ai-chat-messages", activeChatId] });
      setLiveSteps([]);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toastApiError(e, "Send failed");
    } finally {
      setSending(false);
    }
  };

  const items = messagesQuery.data?.items ?? [];

  const contextSummary = useMemo(() => {
    const parts: string[] = [];
    if (context.hosts?.length) parts.push(`${context.hosts.length} host(s)`);
    if (context.playbooks?.length) parts.push(`${context.playbooks.length} playbook(s)`);
    if (context.roles?.length) parts.push(`${context.roles.length} role(s)`);
    return parts.length ? parts.join(", ") : "None";
  }, [context]);

  return (
    <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
      <DialogContent
        showCloseButton
        className={cn(
          "!top-0 !left-auto !right-0 !bottom-0 !translate-x-0 !translate-y-0",
          "h-[100dvh] max-h-[100dvh] w-full max-w-md rounded-none sm:max-w-md",
          "flex flex-col gap-0 p-0 overflow-hidden border-l border-zinc-800 bg-zinc-950",
        )}
      >
        <DialogHeader className="px-3 py-2 border-b border-zinc-800 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Sparkles className="size-4 text-violet-400" />
            Racksmith AI
          </DialogTitle>
        </DialogHeader>

        {!repoReady ? (
          <p className="p-4 text-xs text-zinc-500">Select a repository to use AI chat.</p>
        ) : (
          <>
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800 overflow-x-auto shrink-0">
              {openChatIds.map((id) => (
                <div
                  key={id}
                  className={cn(
                    "flex items-center gap-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px]",
                    activeChatId === id
                      ? "border-violet-500/50 bg-violet-500/10 text-zinc-100"
                      : "border-zinc-700 text-zinc-400",
                  )}
                >
                  <button
                    type="button"
                    className="max-w-[72px] truncate"
                    onClick={() => setActiveChatId(id)}
                    title={id}
                  >
                    {id.slice(0, 8)}…
                  </button>
                  <button
                    type="button"
                    className="text-zinc-500 hover:text-zinc-200 p-0.5"
                    aria-label="Close chat"
                    onClick={() => void handleCloseChat(id)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 size-7"
                onClick={() => void handleNewChat()}
                aria-label="New chat"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>

            <ScrollArea className="flex-1 min-h-0 px-3">
              <div className="space-y-3 py-3 pr-2">
                {messagesQuery.isLoading && (
                  <div className="flex justify-center py-8 text-zinc-500">
                    <Loader2 className="size-5 animate-spin" />
                  </div>
                )}
                {items.map((m, i) => (
                  <div
                    key={`${i}-${m.kind}`}
                    className={cn(
                      "rounded-md px-2.5 py-2 text-xs whitespace-pre-wrap break-words",
                      m.kind === "user"
                        ? "bg-zinc-800 text-zinc-100 ml-4"
                        : "bg-zinc-900 text-zinc-300 mr-4 border border-zinc-800",
                    )}
                  >
                    {m.text}
                  </div>
                ))}
                {liveSteps.length > 0 && (
                  <div className="mr-4 rounded-md border border-violet-500/20 bg-violet-500/5 px-2.5 py-2 text-[11px] text-zinc-500 whitespace-pre-wrap">
                    {liveSteps.join("")}
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t border-zinc-800 p-2 space-y-2 shrink-0">
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]">
                      <MessageSquarePlus className="size-3 mr-1" />
                      Context
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-2 space-y-2" align="start">
                    <p className="text-[10px] text-zinc-500">Attach ids sent with each message.</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      <p className="text-[10px] font-medium text-zinc-400">Hosts</p>
                      {hosts.slice(0, 40).map((h) => (
                        <label key={h.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(context.hosts?.includes(h.id))}
                            onChange={(e) => {
                              setContext((c) => {
                                const cur = new Set(c.hosts ?? []);
                                if (e.target.checked) cur.add(h.id);
                                else cur.delete(h.id);
                                return { ...c, hosts: [...cur] };
                              });
                            }}
                          />
                          <span className="truncate">{h.name ?? h.id}</span>
                        </label>
                      ))}
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      <p className="text-[10px] font-medium text-zinc-400">Playbooks</p>
                      {playbooks.slice(0, 40).map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(context.playbooks?.includes(p.id))}
                            onChange={(e) => {
                              setContext((c) => {
                                const cur = new Set(c.playbooks ?? []);
                                if (e.target.checked) cur.add(p.id);
                                else cur.delete(p.id);
                                return { ...c, playbooks: [...cur] };
                              });
                            }}
                          />
                          <span className="truncate">{p.name}</span>
                        </label>
                      ))}
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      <p className="text-[10px] font-medium text-zinc-400">Roles</p>
                      {roles.slice(0, 40).map((r) => (
                        <label key={r.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(context.roles?.includes(r.id))}
                            onChange={(e) => {
                              setContext((c) => {
                                const cur = new Set(c.roles ?? []);
                                if (e.target.checked) cur.add(r.id);
                                else cur.delete(r.id);
                                return { ...c, roles: [...cur] };
                              });
                            }}
                          />
                          <span className="truncate">{r.name}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <span className="text-[10px] text-zinc-500 truncate">{contextSummary}</span>
              </div>
              <div className="flex gap-2 items-end">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about playbooks, roles, hosts…"
                  className="min-h-[72px] max-h-[160px] text-xs resize-y bg-zinc-900 border-zinc-800"
                  disabled={sending || !activeChatId}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  className="shrink-0"
                  disabled={sending || !input.trim() || !activeChatId}
                  onClick={() => void handleSend()}
                  aria-label="Send"
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
