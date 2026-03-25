import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Minus, Plus, Sparkles, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  type ChatUiMessage,
} from "@/lib/ai-chat";
import { useHosts, usePlaybooks, useRoles, useRackEntries } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";
import { invalidateQueriesForRacksmithAgentTool } from "@/lib/queryClient";
import { MarkdownContent } from "@/components/shared/markdown-content";
import { AiChatComposer, type MentionCandidate } from "./ai-chat-composer";
import {
  AiThinkingBlock,
  AiToolCallBlock,
  AiToolResultBlock,
  type LiveStreamBlock,
  type LiveToolCallBlock,
  type LiveToolResultBlock,
} from "./ai-chat-blocks";

const MAX_RUN_OUTPUT_CHARS = 200_000;

function getActiveToolCallIndex(blocks: LiveStreamBlock[]): number | null {
  const stack: number[] = [];
  blocks.forEach((b, i) => {
    if (b.kind === "call") stack.push(i);
    else if (b.kind === "result") stack.pop();
  });
  return stack.length ? stack[stack.length - 1]! : null;
}

const assistantMarkdownClassName = cn(
  "text-zinc-300",
  "[&_p]:text-[12px] [&_p]:leading-relaxed [&_p]:my-1.5",
  "[&_ul]:my-1.5 [&_ol]:my-1.5 [&_ul]:pl-5 [&_ol]:pl-5",
  "[&_li]:text-[12px] [&_li]:leading-relaxed [&_li]:my-0.5",
  "[&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-zinc-100 [&_h1]:mt-3 [&_h1]:mb-1.5",
  "[&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:text-zinc-200 [&_h2]:mt-2.5 [&_h2]:mb-1",
  "[&_h3]:text-xs [&_h3]:font-medium [&_h3]:text-zinc-200 [&_h3]:mt-2 [&_h3]:mb-1",
  "[&_strong]:text-zinc-100",
  "[&_:not(pre)>code]:text-[11px]",
  "[&_pre]:my-2 [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:border [&_pre]:border-zinc-800",
  "[&_pre_code]:text-[11px]",
  "[&_blockquote]:text-zinc-400",
  "[&_table]:text-[11px]",
);

function useRepoScope() {
  const status = useSetupStore((s) => s.status);
  const userId = status?.user?.id ?? "";
  const repoFull = status?.repo?.full_name ?? "";
  return { userId, repoFull, repoReady: Boolean(status?.repo_ready && userId && repoFull) };
}

function MessageRow({ m }: { m: ChatUiMessage }) {
  switch (m.kind) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-lg px-3.5 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap break-words bg-zinc-800 text-zinc-100">
            {m.text}
          </div>
        </div>
      );
    case "assistant":
      return (
        <div className="min-w-0">
          <MarkdownContent className={assistantMarkdownClassName}>
            {m.text}
          </MarkdownContent>
        </div>
      );
    case "thinking":
      return m.text ? <AiThinkingBlock text={m.text} /> : null;
    case "tool_call":
      return m.tool ? (
        <AiToolCallBlock tool={m.tool} args={m.args ?? undefined} />
      ) : null;
    case "tool_result":
      return m.tool ? (
        <AiToolResultBlock
          tool={m.tool}
          preview={m.result_preview ?? m.text ?? ""}
          outcome={m.outcome}
          resultType={m.result_type}
          exitCode={m.exit_code ?? undefined}
          entityId={m.entity_id ?? undefined}
          entityName={m.entity_name ?? undefined}
          runStatus={m.run_status ?? undefined}
        />
      ) : null;
    case "system":
      return (
        <div className="mx-4 rounded-md border border-zinc-700/40 bg-zinc-900/50 px-2 py-1 text-[10px] text-zinc-500 font-mono">
          {m.text}
        </div>
      );
    default:
      return (
        <div className="mx-4 rounded-md border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500">
          {m.text}
        </div>
      );
  }
}

function attachmentsToContext(items: MentionCandidate[]): ChatStreamContext {
  const ctx: ChatStreamContext = {};
  for (const a of items) {
    const key =
      a.type === "host" ? "hosts"
      : a.type === "playbook" ? "playbooks"
      : a.type === "role" ? "roles"
      : "racks";
    (ctx[key] ??= []).push(a.id);
  }
  return ctx;
}

export function AiBottomPanel() {
  const panelOpen = useAiChatUiStore((s) => s.panelOpen);
  const setPanelOpen = useAiChatUiStore((s) => s.setPanelOpen);
  const disengageDock = useAiChatUiStore((s) => s.disengageDock);
  const { userId, repoFull, repoReady } = useRepoScope();
  const queryClient = useQueryClient();

  const [openChatIds, setOpenChatIds] = useState<string[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [liveBlocks, setLiveBlocks] = useState<LiveStreamBlock[]>([]);
  const [attachments, setAttachments] = useState<MentionCandidate[]>([]);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const { data: hosts = [] } = useHosts();
  const { data: playbooks = [] } = usePlaybooks();
  const { data: roles = [] } = useRoles();
  const { data: rackEntries = [] } = useRackEntries();

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
    setActiveChatId((cur) => {
      if (cur && ids.includes(cur)) return cur;
      return ids[0] ?? null;
    });
  }, [repoReady, userId, repoFull]);

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
    if (next.length === 0) {
      disengageDock();
    }
  };

  const context = useMemo(() => attachmentsToContext(attachments), [attachments]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeChatId || sending) return;
    setInput("");
    setSending(true);
    setLiveBlocks([{ kind: "user", text }]);
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
            const ev = JSON.parse(payload) as {
              type?: string;
              text?: string;
              message?: string;
              tool?: string;
              args?: Record<string, unknown>;
              result?: string;
              chunk?: string;
              run_id?: string;
              result_type?: string;
              exit_code?: number;
              entity_id?: string;
              entity_name?: string;
              run_status?: string;
            };
            if (ev.type === "thinking" && ev.text) {
              setLiveBlocks((s) => {
                const last = s[s.length - 1];
                if (last?.kind === "thinking") {
                  return [
                    ...s.slice(0, -1),
                    { kind: "thinking", text: last.text + ev.text! },
                  ];
                }
                return [...s, { kind: "thinking", text: ev.text! }];
              });
            }
            if (ev.type === "tool_call" && ev.tool) {
              setLiveBlocks((s) => [
                ...s,
                {
                  kind: "call",
                  tool: ev.tool!,
                  args: ev.args,
                  startedAt: Date.now(),
                } satisfies LiveToolCallBlock,
              ]);
            }
            if (ev.type === "run_output") {
              const chunk = ev.chunk ?? "";
              const tool = ev.tool ?? "";
              const runId = ev.run_id ?? "";
              setLiveBlocks((s) => {
                const next = [...s];
                const tryPatch = (idx: number) => {
                  const b = next[idx];
                  if (b?.kind !== "call") return false;
                  if (tool && b.tool !== tool) return false;
                  const prev = b.runOutput ?? "";
                  let merged = prev + chunk;
                  if (merged.length > MAX_RUN_OUTPUT_CHARS) {
                    merged =
                      "…(truncated for UI)\n" +
                      merged.slice(-MAX_RUN_OUTPUT_CHARS);
                  }
                  next[idx] = {
                    ...b,
                    runOutput: merged,
                    runId: runId || b.runId,
                  };
                  return true;
                };
                for (let i = next.length - 1; i >= 0; i--) {
                  const b = next[i];
                  if (b?.kind !== "call") continue;
                  if (tool && b.tool === tool && tryPatch(i)) return next;
                }
                for (let i = next.length - 1; i >= 0; i--) {
                  const b = next[i];
                  if (
                    b?.kind === "call" &&
                    (b.tool === "run_playbook" || b.tool === "run_role") &&
                    tryPatch(i)
                  ) {
                    return next;
                  }
                }
                return s;
              });
            }
            if (ev.type === "tool_result" && ev.tool) {
              invalidateQueriesForRacksmithAgentTool(ev.tool);
              setLiveBlocks((s) => {
                const calls = s.filter((b): b is LiveToolCallBlock => b.kind === "call");
                const results = s.filter((b): b is LiveToolResultBlock => b.kind === "result");
                const pending = calls[calls.length - results.length - 1];
                const startedAt = pending?.startedAt;
                const elapsedMs =
                  startedAt != null ? Date.now() - startedAt : null;
                let outcome: string | null = "success";
                if (
                  ev.result_type === "run" &&
                  typeof ev.exit_code === "number" &&
                  ev.exit_code !== 0
                ) {
                  outcome = "failed";
                }
                if (
                  ev.result_type === "ssh" &&
                  typeof ev.exit_code === "number" &&
                  ev.exit_code !== 0
                ) {
                  outcome = "failed";
                }
                const block: LiveToolResultBlock = {
                  kind: "result",
                  tool: ev.tool!,
                  result: ev.result ?? "",
                  resultType: ev.result_type,
                  exitCode: ev.exit_code ?? null,
                  entityId: ev.entity_id ?? null,
                  entityName: ev.entity_name ?? null,
                  runStatus: ev.run_status ?? null,
                  outcome,
                  elapsedMs,
                };
                return [...s, block];
              });
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
      setLiveBlocks([]);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toastApiError(e, "Send failed");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messagesQuery.data?.items?.length, liveBlocks]);

  const items = messagesQuery.data?.items ?? [];

  const mentionCandidates = useMemo(
    () => [
      ...hosts.map((h) => ({ type: "host" as const, id: h.id, label: h.name ?? h.id })),
      ...playbooks.map((p) => ({ type: "playbook" as const, id: p.id, label: p.name })),
      ...roles.map((r) => ({ type: "role" as const, id: r.id, label: r.name })),
      ...rackEntries.map((re) => ({ type: "rack" as const, id: re.rack.id, label: re.rack.name })),
    ],
    [hosts, playbooks, roles, rackEntries],
  );

  const handleAttach = useCallback((item: MentionCandidate) => {
    setAttachments((prev) => {
      const key = `${item.type}:${item.id}`;
      if (prev.some((a) => `${a.type}:${a.id}` === key)) return prev;
      return [...prev, item];
    });
  }, []);

  const handleDetachLast = useCallback(() => {
    setAttachments((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  }, []);

  const handleDetach = useCallback((item: MentionCandidate) => {
    setAttachments((prev) =>
      prev.filter((a) => !(a.type === item.type && a.id === item.id)),
    );
  }, []);

  if (!repoReady) {
    return (
      <div className="h-full flex items-center justify-center bg-[#09090b]">
        <p className="text-xs text-zinc-500">Select a repository to use AI chat.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#09090b] shadow-[0_-6px_16px_rgba(0,0,0,0.5)]">
      <div className="flex items-center border-b border-zinc-800/60 shrink-0">
        <Sparkles className="size-3 text-violet-400 mx-2 shrink-0" />
        <div className="flex-1 flex items-center min-w-0 overflow-x-auto scrollbar-hide">
          {openChatIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveChatId(id)}
              className={cn(
                "group flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium tracking-wide border-r border-zinc-800/60 shrink-0 transition-colors",
                activeChatId === id
                  ? "bg-zinc-900 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50",
              )}
            >
              <span className="truncate max-w-[100px]">{id.slice(0, 8)}…</span>
              <span
                role="button"
                tabIndex={0}
                className="size-3.5 flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCloseChat(id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    void handleCloseChat(id);
                  }
                }}
              >
                <X className="size-2.5" />
              </span>
            </button>
          ))}
          <button
            type="button"
            className="flex items-center justify-center px-2 py-1.5 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
            aria-label="New chat"
            onClick={() => void handleNewChat()}
          >
            <Plus className="size-3" />
          </button>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-zinc-500 hover:text-zinc-300 shrink-0"
          aria-label="Minimize AI panel"
          onClick={() => setPanelOpen(false)}
        >
          <Minus className="size-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-zinc-500 hover:text-zinc-300 mr-1 shrink-0"
          aria-label="Close AI dock"
          onClick={disengageDock}
        >
          <X className="size-3" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="space-y-4 py-3 pr-4">
            {messagesQuery.isLoading && (
              <div className="flex justify-center py-6 text-zinc-500">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
            {items.map((m, i) => (
              <MessageRow key={`${i}-${m.kind}-${m.tool ?? ""}`} m={m} />
            ))}
            {liveBlocks.map((b, i) => {
              if (b.kind === "user") {
                return (
                  <div key={`lb-${i}`} className="flex justify-end">
                    <div className="max-w-[85%] rounded-lg px-3.5 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap break-words bg-zinc-800 text-zinc-100">
                      {b.text}
                    </div>
                  </div>
                );
              }
              if (b.kind === "thinking") {
                return <AiThinkingBlock key={`lb-${i}`} text={b.text} />;
              }
              if (b.kind === "call") {
                const activeIdx = getActiveToolCallIndex(liveBlocks);
                const active = i === activeIdx;
                return (
                  <AiToolCallBlock
                    key={`lb-${i}`}
                    tool={b.tool}
                    args={b.args}
                    compact
                    active={active}
                    startedAt={b.startedAt}
                    runOutput={b.runOutput}
                    runId={b.runId}
                  />
                );
              }
              return (
                <AiToolResultBlock
                  key={`lb-${i}`}
                  tool={b.tool}
                  preview={b.result}
                  outcome={b.outcome ?? undefined}
                  resultType={b.resultType}
                  exitCode={b.exitCode ?? undefined}
                  entityId={b.entityId ?? undefined}
                  entityName={b.entityName ?? undefined}
                  runStatus={b.runStatus ?? undefined}
                  elapsedMs={b.elapsedMs ?? undefined}
                />
              );
            })}
            <div ref={scrollEndRef} />
          </div>
        </ScrollArea>

        <div className="border-t border-zinc-800/60 px-4 pt-2.5 pb-3 shrink-0">
          <AiChatComposer
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={sending || !activeChatId}
            sending={sending}
            candidates={mentionCandidates}
            attachments={attachments}
            onAttach={handleAttach}
            onDetachLast={handleDetachLast}
            onDetach={handleDetach}
          />
        </div>
      </div>
    </div>
  );
}
