import { Wrench, CheckCircle2, XCircle, Ban, Brain, ChevronRight } from "lucide-react";
import { MarkdownContent } from "@/components/shared/markdown-content";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ToolUiCategory = "read" | "write" | "delete" | "run";

function toolUiCategory(tool: string): ToolUiCategory {
  const t = tool.toLowerCase();
  if (t.startsWith("delete_")) return "delete";
  if (t.includes("ssh") || t.startsWith("run_") || t === "probe_managed_host") {
    return "run";
  }
  if (t.startsWith("list_") || t.startsWith("get_")) return "read";
  return "write";
}

const categoryAccent: Record<ToolUiCategory, string> = {
  read: "border-sky-500/35 bg-sky-500/[0.06]",
  write: "border-amber-500/35 bg-amber-500/[0.06]",
  run: "border-emerald-500/35 bg-emerald-500/[0.06]",
  delete: "border-rose-500/35 bg-rose-500/[0.06]",
};

const categoryBadgeClass: Record<ToolUiCategory, string> = {
  read: "border-sky-500/40 text-sky-400/90 bg-transparent",
  write: "border-amber-500/40 text-amber-400/90 bg-transparent",
  run: "border-emerald-500/40 text-emerald-400/90 bg-transparent",
  delete: "border-rose-500/40 text-rose-400/90 bg-transparent",
};

const categoryLabel: Record<ToolUiCategory, string> = {
  read: "Read",
  write: "Write",
  run: "Run",
  delete: "Delete",
};

function toolCallAccentClass(tool: string): string {
  return categoryAccent[toolUiCategory(tool)];
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
  const cat = toolUiCategory(tool);
  return (
    <details
      className={cn(
        "group/tc rounded-md border text-[10px] mr-8",
        toolCallAccentClass(tool),
      )}
    >
      <summary className="flex items-center gap-1.5 text-zinc-300 font-medium px-3 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3 shrink-0 text-zinc-500 transition-transform group-open/tc:rotate-90" />
        <Wrench className="size-3 shrink-0 text-zinc-500" />
        <Badge
          variant="outline"
          className={cn(
            "h-4 rounded-sm px-1 py-0 text-[8px] font-semibold uppercase tracking-wide",
            categoryBadgeClass[cat],
          )}
        >
          {categoryLabel[cat]}
        </Badge>
        <span className="font-mono truncate">{tool}</span>
      </summary>
      {hasArgs ? (
        <pre
          className={cn(
            "px-3 pb-2 text-zinc-500 font-mono whitespace-pre-wrap break-all",
            compact ? "max-h-16 overflow-y-auto" : "max-h-40 overflow-y-auto",
          )}
        >
          {JSON.stringify(args, null, 2)}
        </pre>
      ) : null}
    </details>
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
  const cat = toolUiCategory(tool);
  return (
    <details
      className={cn(
        "group/tr rounded-md border text-[10px] mr-8",
        denied
          ? "border-rose-500/35 bg-rose-500/[0.06]"
          : ok
            ? "border-zinc-600/60 bg-zinc-900/80"
            : "border-orange-500/35 bg-orange-500/[0.06]",
      )}
    >
      <summary className="flex items-center gap-1.5 text-zinc-400 px-3 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3 shrink-0 text-zinc-500 transition-transform group-open/tr:rotate-90" />
        {ok ? (
          <CheckCircle2 className="size-3 shrink-0 text-emerald-500/80" />
        ) : denied ? (
          <Ban className="size-3 shrink-0 text-rose-400/80" />
        ) : (
          <XCircle className="size-3 shrink-0 text-orange-400/80" />
        )}
        <Badge
          variant="outline"
          className={cn(
            "h-4 rounded-sm px-1 py-0 text-[8px] font-semibold uppercase tracking-wide",
            categoryBadgeClass[cat],
          )}
        >
          {categoryLabel[cat]}
        </Badge>
        <span className="font-mono truncate">{tool}</span>
        {outcome ? (
          <span className="text-zinc-600 uppercase tracking-wide">{outcome}</span>
        ) : null}
      </summary>
      {preview ? (
        <pre className="px-3 pb-2 text-zinc-500 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
          {preview}
        </pre>
      ) : null}
    </details>
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
    <div className="mr-8 rounded-md border border-zinc-700/50 bg-zinc-900/40 px-3.5 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-zinc-600 mb-1 text-[10px]">
        <Brain className="size-3" />
        <span className="uppercase tracking-wide">Reasoning</span>
      </div>
      <MarkdownContent className={thinkingMarkdownClassName}>{text}</MarkdownContent>
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
