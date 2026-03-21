import { Wrench, CheckCircle2, XCircle, Ban, Brain } from "lucide-react";
import { MarkdownContent } from "@/components/shared/markdown-content";
import { cn } from "@/lib/utils";
import type { ChatStreamContext } from "@/lib/ai-chat";
import type { MentionCandidate } from "./ai-mention-composer";

function toolCallAccentClass(tool: string): string {
  const t = tool.toLowerCase();
  if (t.startsWith("list_") || t.startsWith("get_")) {
    return "border-sky-500/35 bg-sky-500/[0.06]";
  }
  if (t.includes("create") || t.includes("update")) {
    return "border-amber-500/35 bg-amber-500/[0.06]";
  }
  if (t.includes("ssh") || t.startsWith("run_")) {
    return "border-emerald-500/35 bg-emerald-500/[0.06]";
  }
  return "border-violet-500/35 bg-violet-500/[0.06]";
}

export function AiToolCallBlock({
  tool,
  args,
  compact,
}: {
  tool: string;
  args?: Record<string, unknown> | null;
  compact?: boolean;
}) {
  const hasArgs = args && Object.keys(args).length > 0;
  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-[10px] mr-8",
        toolCallAccentClass(tool),
      )}
    >
      <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
        <Wrench className="size-3 shrink-0 text-zinc-500" />
        <span className="font-mono truncate">{tool}</span>
      </div>
      {hasArgs ? (
        <pre
          className={cn(
            "mt-1.5 text-zinc-500 font-mono whitespace-pre-wrap break-all",
            compact ? "max-h-16 overflow-y-auto" : "max-h-40 overflow-y-auto",
          )}
        >
          {JSON.stringify(args, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export function AiToolResultBlock({
  tool,
  preview,
  outcome,
}: {
  tool: string;
  preview: string;
  outcome?: string | null;
}) {
  const ok = (outcome ?? "success") === "success";
  const denied = outcome === "denied";
  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-[10px] mr-8",
        denied
          ? "border-rose-500/35 bg-rose-500/[0.06]"
          : ok
            ? "border-zinc-600/60 bg-zinc-900/80"
            : "border-orange-500/35 bg-orange-500/[0.06]",
      )}
    >
      <div className="flex items-center gap-1.5 text-zinc-400">
        {ok ? (
          <CheckCircle2 className="size-3 shrink-0 text-emerald-500/80" />
        ) : denied ? (
          <Ban className="size-3 shrink-0 text-rose-400/80" />
        ) : (
          <XCircle className="size-3 shrink-0 text-orange-400/80" />
        )}
        <span className="font-mono truncate">{tool}</span>
        {outcome ? (
          <span className="text-zinc-600 uppercase tracking-wide">{outcome}</span>
        ) : null}
      </div>
      {preview ? (
        <pre className="mt-1.5 text-zinc-500 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
          {preview}
        </pre>
      ) : null}
    </div>
  );
}

const thinkingMarkdownClassName = cn(
  "text-zinc-500",
  "[&_p]:text-[10px] [&_p]:leading-relaxed [&_p]:my-1",
  "[&_ul]:my-1 [&_ol]:my-1 [&_ul]:pl-4 [&_ol]:pl-4",
  "[&_li]:text-[10px] [&_li]:my-0.5",
  "[&_strong]:text-zinc-400",
  "[&_:not(pre)>code]:text-[9px]",
);

export function AiThinkingBlock({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="mr-8 rounded-md border border-zinc-700/50 bg-zinc-900/40 px-2.5 py-1.5 min-w-0">
      <div className="flex items-center gap-1.5 text-zinc-600 mb-1 text-[10px]">
        <Brain className="size-3" />
        <span className="uppercase tracking-wide">Reasoning</span>
      </div>
      <MarkdownContent className={thinkingMarkdownClassName}>{text}</MarkdownContent>
    </div>
  );
}

const CHIP: Record<MentionCandidate["type"], string> = {
  host: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200/90",
  playbook: "border-sky-500/30 bg-sky-500/10 text-sky-200/90",
  role: "border-amber-500/30 bg-amber-500/10 text-amber-200/90",
  rack: "border-rose-500/30 bg-rose-500/10 text-rose-200/90",
};

export function AiContextChips({
  context,
  resolveLabel,
  onRemove,
}: {
  context: ChatStreamContext;
  resolveLabel: (type: MentionCandidate["type"], id: string) => string;
  onRemove: (type: MentionCandidate["type"], id: string) => void;
}) {
  type Row = { t: MentionCandidate["type"]; id: string; label: string };
  const rows: Row[] = [];
  for (const id of context.hosts ?? []) {
    rows.push({ t: "host", id, label: resolveLabel("host", id) });
  }
  for (const id of context.playbooks ?? []) {
    rows.push({ t: "playbook", id, label: resolveLabel("playbook", id) });
  }
  for (const id of context.roles ?? []) {
    rows.push({ t: "role", id, label: resolveLabel("role", id) });
  }
  for (const id of context.racks ?? []) {
    rows.push({ t: "rack", id, label: resolveLabel("rack", id) });
  }
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 items-center px-0.5">
      <span className="text-[9px] text-zinc-600 uppercase tracking-wider shrink-0 mr-0.5">
        Context
      </span>
      {rows.map((r) => (
        <span
          key={`${r.t}-${r.id}`}
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] max-w-[200px]",
            CHIP[r.t],
          )}
          title={r.id}
        >
          <span className="truncate">
            <span className="opacity-70">@{r.t}</span>
            <span className="mx-0.5">·</span>
            {r.label}
          </span>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 hover:bg-black/20 text-current opacity-60 hover:opacity-100"
            aria-label={`Remove ${r.label} from context`}
            onClick={() => onRemove(r.t, r.id)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export type LiveToolEvent =
  | { kind: "call"; tool: string; args?: Record<string, unknown> }
  | { kind: "result"; tool: string; result: string };

/** Ordered stream items while a turn is in flight (matches SSE order). */
export type LiveStreamBlock =
  | { kind: "thinking"; text: string }
  | LiveToolEvent;
