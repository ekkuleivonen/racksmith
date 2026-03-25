import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSetupStore } from "@/stores/setup";
import {
  getAiChatMessages,
  resumeAiChatTurn,
  streamAiChatTurn,
  type ChatStreamContext,
  type ChatUiMessage,
} from "@/lib/ai-chat";
import { useGroups, useHosts, usePlaybooks, useRoles, useRackEntries } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";
import { invalidateQueriesForRacksmithAgentTool } from "@/lib/queryClient";
import { MarkdownContent } from "@/components/shared/markdown-content";
import { AiChatComposer, type MentionCandidate } from "./ai-chat-composer";
import {
  AiInputRequiredBlock,
  AiThinkingBlock,
  AiToolCallBlock,
  type LiveStreamBlock,
  type LiveToolBlock,
} from "./ai-chat-blocks";

const MAX_RUN_OUTPUT_CHARS = 200_000;

function getActiveToolCallIndex(blocks: LiveStreamBlock[]): number | null {
  const pending: number[] = [];
  blocks.forEach((b, i) => {
    if (b.kind === "tool" && !b.done) pending.push(i);
  });
  return pending.length ? pending[pending.length - 1]! : null;
}

type HistoryRow =
  | { type: "msg"; m: ChatUiMessage }
  | { type: "tool_pair"; call: ChatUiMessage; result: ChatUiMessage };

function toHistoryRows(items: ChatUiMessage[]): HistoryRow[] {
  const out: HistoryRow[] = [];
  const pending: ChatUiMessage[] = [];
  for (const m of items) {
    if (m.kind === "tool_call" && m.tool) {
      pending.push(m);
      continue;
    }
    if (m.kind === "tool_result" && m.tool && pending.length > 0) {
      out.push({ type: "tool_pair", call: pending.shift()!, result: m });
      continue;
    }
    while (pending.length) {
      out.push({ type: "msg", m: pending.shift()! });
    }
    out.push({ type: "msg", m });
  }
  while (pending.length) {
    out.push({ type: "msg", m: pending.shift()! });
  }
  return out;
}

type PendingRunChunk = { chunk: string; tool: string; runId: string };

function patchSingleRunOutput(
  s: LiveStreamBlock[],
  chunk: string,
  tool: string,
  runId: string,
): LiveStreamBlock[] {
  const next = [...s];
  const tryPatch = (idx: number): boolean => {
    const b = next[idx];
    if (b?.kind !== "tool" || b.done) return false;
    if (tool && b.tool !== tool) return false;
    const prev = b.runOutput ?? "";
    let merged = prev + chunk;
    if (merged.length > MAX_RUN_OUTPUT_CHARS) {
      merged =
        "…(truncated for UI)\n" + merged.slice(-MAX_RUN_OUTPUT_CHARS);
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
    if (b?.kind !== "tool" || b.done) continue;
    if (tool && b.tool === tool && tryPatch(i)) return next;
  }
  for (let i = next.length - 1; i >= 0; i--) {
    const b = next[i];
    if (
      b?.kind === "tool" &&
      !b.done &&
      (b.tool === "run_playbook" || b.tool === "run_role") &&
      tryPatch(i)
    ) {
      return next;
    }
  }
  return s;
}

type AgentSseEvent = {
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
  fields?: Array<{ key: string; label: string; type: string; required?: boolean }>;
};

type AgentSseDeps = {
  setLiveBlocks: Dispatch<SetStateAction<LiveStreamBlock[]>>;
  pendingRunOutputRef: MutableRefObject<PendingRunChunk[]>;
  scheduleRunOutputFlush: () => void;
  flushRunOutputSync: () => void;
};

function applyAgentSseEvent(ev: AgentSseEvent, deps: AgentSseDeps): void {
  const {
    setLiveBlocks,
    pendingRunOutputRef,
    scheduleRunOutputFlush,
    flushRunOutputSync,
  } = deps;

  if (ev.type === "thinking" && ev.text) {
    setLiveBlocks((s) => {
      const last = s[s.length - 1];
      if (last?.kind === "thinking") {
        return [...s.slice(0, -1), { kind: "thinking", text: last.text + ev.text! }];
      }
      return [...s, { kind: "thinking", text: ev.text! }];
    });
    return;
  }
  if (ev.type === "tool_call" && ev.tool) {
    setLiveBlocks((s) => [
      ...s,
      {
        kind: "tool",
        tool: ev.tool!,
        args: ev.args,
        startedAt: Date.now(),
      } satisfies LiveToolBlock,
    ]);
    return;
  }
  if (ev.type === "run_output") {
    pendingRunOutputRef.current.push({
      chunk: ev.chunk ?? "",
      tool: ev.tool ?? "",
      runId: ev.run_id ?? "",
    });
    scheduleRunOutputFlush();
    return;
  }
  if (ev.type === "tool_result" && ev.tool) {
    invalidateQueriesForRacksmithAgentTool(ev.tool);
    flushRunOutputSync();
    setLiveBlocks((s) => {
      const idx = s.findIndex((b) => b.kind === "tool" && !b.done);
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
      if (idx < 0) {
        return [
          ...s,
          {
            kind: "tool",
            tool: ev.tool!,
            startedAt: Date.now(),
            done: true,
            resultPreview: ev.result ?? "",
            resultType: ev.result_type,
            exitCode: ev.exit_code ?? null,
            entityId: ev.entity_id ?? null,
            entityName: ev.entity_name ?? null,
            runStatus: ev.run_status ?? null,
            outcome,
            elapsedMs: null,
          } satisfies LiveToolBlock,
        ];
      }
      const b = s[idx] as LiveToolBlock;
      const elapsedMs = Date.now() - b.startedAt;
      return s.map((block, i) =>
        i === idx
          ? ({
              ...b,
              done: true,
              resultPreview: ev.result ?? "",
              resultType: ev.result_type,
              exitCode: ev.exit_code ?? null,
              entityId: ev.entity_id ?? null,
              entityName: ev.entity_name ?? null,
              runStatus: ev.run_status ?? null,
              outcome,
              elapsedMs,
            } satisfies LiveToolBlock)
          : block,
      );
    });
    return;
  }
  if (ev.type === "input_required" && ev.fields && ev.fields.length > 0) {
    const fields = ev.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type === "password" ? ("password" as const) : ("text" as const),
      required: f.required !== false,
    }));
    setLiveBlocks((s) => [...s, { kind: "input_required", fields }]);
    return;
  }
  if (ev.type === "error" && ev.message) {
    toast.error(ev.message);
  }
}

async function consumeAgentSseResponse(res: Response, deps: AgentSseDeps): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
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
        const ev = JSON.parse(payload) as AgentSseEvent;
        applyAgentSseEvent(ev, deps);
      } catch {
        /* ignore */
      }
    }
  }
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

const MessageRow = memo(function MessageRow({ m }: { m: ChatUiMessage }) {
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
        <AiToolCallBlock
          tool={m.tool}
          done
          resultPreview={m.result_preview ?? m.text ?? ""}
          outcome={m.outcome}
          resultType={m.result_type ?? undefined}
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
});

function attachmentsToContext(items: MentionCandidate[]): ChatStreamContext {
  const ctx: ChatStreamContext = {};
  for (const a of items) {
    const key =
      a.type === "host" ? "hosts"
      : a.type === "playbook" ? "playbooks"
      : a.type === "role" ? "roles"
      : a.type === "group" ? "groups"
      : "racks";
    (ctx[key] ??= []).push(a.id);
  }
  return ctx;
}

export function AiChatContent({ chatId }: { chatId: string }) {
  const { repoReady } = useRepoScope();
  const queryClient = useQueryClient();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [liveBlocks, setLiveBlocks] = useState<LiveStreamBlock[]>([]);
  const [attachments, setAttachments] = useState<MentionCandidate[]>([]);
  const attachmentsRef = useRef<MentionCandidate[]>([]);
  attachmentsRef.current = attachments;
  const pendingRunOutputRef = useRef<PendingRunChunk[]>([]);
  const runOutputRafRef = useRef<number>(0);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const applyPendingRunOutputBatch = () => {
    const batch = pendingRunOutputRef.current;
    pendingRunOutputRef.current = [];
    if (batch.length === 0) return;
    setLiveBlocks((prev) => {
      let next = prev;
      for (const item of batch) {
        next = patchSingleRunOutput(next, item.chunk, item.tool, item.runId);
      }
      return next;
    });
  };

  const scheduleRunOutputFlush = () => {
    if (runOutputRafRef.current) return;
    runOutputRafRef.current = requestAnimationFrame(() => {
      runOutputRafRef.current = 0;
      applyPendingRunOutputBatch();
    });
  };

  const flushRunOutputSync = () => {
    if (runOutputRafRef.current) {
      cancelAnimationFrame(runOutputRafRef.current);
      runOutputRafRef.current = 0;
    }
    applyPendingRunOutputBatch();
  };

  useEffect(
    () => () => {
      if (runOutputRafRef.current) {
        cancelAnimationFrame(runOutputRafRef.current);
        runOutputRafRef.current = 0;
      }
      pendingRunOutputRef.current = [];
    },
    [],
  );

  useEffect(() => {
    setLiveBlocks([]);
  }, [chatId]);

  const { data: hosts = [] } = useHosts();
  const { data: playbooks = [] } = usePlaybooks();
  const { data: roles = [] } = useRoles();
  const { data: groups = [] } = useGroups();
  const { data: rackEntries = [] } = useRackEntries();

  const messagesQuery = useQuery({
    queryKey: ["ai-chat-messages", chatId],
    queryFn: () => getAiChatMessages(chatId),
    enabled: Boolean(chatId && repoReady),
  });

  const streamDeps = (): AgentSseDeps => ({
    setLiveBlocks,
    pendingRunOutputRef,
    scheduleRunOutputFlush,
    flushRunOutputSync,
  });

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !chatId || sending) return;
    const ctx = attachmentsToContext(attachmentsRef.current);
    setAttachments([]);
    setInput("");
    setSending(true);
    setLiveBlocks([{ kind: "user", text }]);
    const controller = new AbortController();
    try {
      const res = await streamAiChatTurn(
        chatId,
        { content: text, context: ctx },
        controller.signal,
      );
      await consumeAgentSseResponse(res, streamDeps());
      flushRunOutputSync();
      await queryClient.invalidateQueries({ queryKey: ["ai-chat-messages", chatId] });
      setLiveBlocks((prev) =>
        prev.some((b) => b.kind === "input_required") ? prev : [],
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toastApiError(e, "Send failed");
    } finally {
      flushRunOutputSync();
      setSending(false);
    }
  };

  const handleRuntimeInputSubmit = async (values: Record<string, string>) => {
    if (!chatId || sending) return;
    setSending(true);
    setLiveBlocks((s) => s.filter((b) => b.kind !== "input_required"));
    try {
      const become = (values.become_password ?? "").trim();
      const runtimeVars = { ...values };
      delete runtimeVars.become_password;
      const filteredRv = Object.fromEntries(
        Object.entries(runtimeVars).filter(([, v]) => v.trim().length > 0),
      );
      const res = await resumeAiChatTurn(chatId, {
        become_password: become || undefined,
        ...(Object.keys(filteredRv).length > 0 ? { runtime_vars: filteredRv } : {}),
      });
      await consumeAgentSseResponse(res, {
        setLiveBlocks,
        pendingRunOutputRef,
        scheduleRunOutputFlush,
        flushRunOutputSync,
      });
      flushRunOutputSync();
      await queryClient.invalidateQueries({ queryKey: ["ai-chat-messages", chatId] });
      setLiveBlocks((prev) =>
        prev.some((b) => b.kind === "input_required") ? prev : [],
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toastApiError(e, "Could not continue");
    } finally {
      flushRunOutputSync();
      setSending(false);
    }
  };

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({
      behavior: sending ? "auto" : "smooth",
      block: "end",
    });
  }, [messagesQuery.data?.items?.length, liveBlocks.length, sending]);

  const historyRows = useMemo(
    () => toHistoryRows(messagesQuery.data?.items ?? []),
    [messagesQuery.data?.items],
  );
  const activeCallIdx = getActiveToolCallIndex(liveBlocks);

  const mentionCandidates = useMemo(
    () => [
      ...hosts.map((h) => ({ type: "host" as const, id: h.id, label: h.name ?? h.id })),
      ...playbooks.map((p) => ({ type: "playbook" as const, id: p.id, label: p.name })),
      ...roles.map((r) => ({ type: "role" as const, id: r.id, label: r.name })),
      ...groups.map((g) => ({ type: "group" as const, id: g.id, label: g.name || g.id })),
      ...rackEntries.map((re) => ({ type: "rack" as const, id: re.rack.id, label: re.rack.name })),
    ],
    [hosts, playbooks, roles, groups, rackEntries],
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
    <div className="h-full flex flex-col bg-[#09090b] min-h-0">
      <div className="flex-1 min-h-0 flex flex-col">
        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="space-y-4 py-3 pr-4">
            {messagesQuery.isLoading && (
              <div className="flex justify-center py-6 text-zinc-500">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
            {historyRows.map((row, i) => {
              if (row.type === "tool_pair") {
                if (!row.call.tool) return null;
                return (
                  <AiToolCallBlock
                    key={`hist-${i}-${row.call.tool}-${row.result.tool ?? ""}`}
                    tool={row.call.tool}
                    args={row.call.args ?? undefined}
                    done
                    resultPreview={row.result.result_preview ?? row.result.text ?? ""}
                    outcome={row.result.outcome}
                    resultType={row.result.result_type ?? undefined}
                    exitCode={row.result.exit_code ?? undefined}
                    entityId={row.result.entity_id ?? undefined}
                    entityName={row.result.entity_name ?? undefined}
                    runStatus={row.result.run_status ?? undefined}
                  />
                );
              }
              const m = row.m;
              return (
                <MessageRow key={`hist-${i}-${m.kind}-${m.tool ?? ""}`} m={m} />
              );
            })}
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
              if (b.kind === "tool") {
                const active = i === activeCallIdx && !b.done;
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
                    done={b.done}
                    resultPreview={b.resultPreview}
                    outcome={b.outcome}
                    resultType={b.resultType}
                    exitCode={b.exitCode ?? undefined}
                    entityId={b.entityId ?? undefined}
                    entityName={b.entityName ?? undefined}
                    runStatus={b.runStatus ?? undefined}
                    elapsedMs={b.elapsedMs ?? undefined}
                  />
                );
              }
              if (b.kind === "input_required") {
                return (
                  <AiInputRequiredBlock
                    key={`lb-${i}`}
                    fields={b.fields}
                    disabled={sending}
                    onSubmit={handleRuntimeInputSubmit}
                  />
                );
              }
              const _exhaustive: never = b;
              return _exhaustive;
            })}
            <div ref={scrollEndRef} />
          </div>
        </ScrollArea>

        <div className="border-t border-zinc-800/60 px-4 pt-2.5 pb-3 shrink-0">
          <AiChatComposer
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={sending || !chatId}
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
