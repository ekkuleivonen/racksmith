import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Wrench,
  CheckCircle2,
  XCircle,
  Ban,
  Brain,
  ChevronRight,
  Loader2,
  Terminal,
} from "lucide-react";
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

function strArg(args: Record<string, unknown> | null | undefined, key: string): string {
  const v = args?.[key];
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function LiveElapsed({ startedAt, active }: { startedAt?: number; active: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || startedAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [active, startedAt]);
  if (startedAt == null || !active) return null;
  const sec = (now - startedAt) / 1000;
  const label = sec < 10 ? sec.toFixed(1) : Math.floor(sec).toString();
  return <span className="text-zinc-500 tabular-nums shrink-0">{label}s</span>;
}

export function AiRunOutputBlock({
  text,
  runId,
  done,
}: {
  text: string;
  runId?: string;
  done?: boolean;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const lineCount = useMemo(() => {
    let count = 1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") count++;
    }
    return count;
  }, [text]);
  const capped = lineCount > 200;
  const display = useMemo(() => {
    if (!capped) return text;
    return text.split("\n").slice(-200).join("\n");
  }, [text, capped]);
  useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [text]);
  if (!text.trim()) return null;
  return (
    <div
      className={cn(
        "mt-1 rounded-md border border-emerald-500/30 bg-zinc-950/90 font-mono text-[9px] text-zinc-400",
        done && "opacity-90",
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-emerald-500/20 px-2 py-1 text-zinc-500">
        <Terminal className="size-2.5 shrink-0 text-emerald-500/70" />
        <span className="uppercase tracking-wide">Ansible output</span>
        {runId ? (
          <span className="truncate font-mono text-[8px] text-zinc-600">{runId.slice(0, 8)}…</span>
        ) : null}
        {capped ? (
          <span className="ml-auto text-[8px] text-amber-500/90">Showing last 200 lines</span>
        ) : null}
      </div>
      <pre
        ref={preRef}
        className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all px-2 py-1.5"
      >
        {display}
      </pre>
    </div>
  );
}

function CallSummaryExtra({ tool, args }: { tool: string; args?: Record<string, unknown> | null }) {
  if (tool === "run_ssh_command") {
    const cmd = strArg(args, "command");
    return cmd ? (
      <code className="mt-1 block rounded bg-zinc-950/80 px-2 py-1 font-mono text-[9px] text-zinc-400">
        {cmd}
      </code>
    ) : null;
  }
  if (tool === "create_role" || tool === "update_role") {
    const desc = strArg(args, "description");
    return desc ? (
      <p className="mt-1 text-[9px] leading-relaxed text-zinc-500 line-clamp-2">{desc}</p>
    ) : null;
  }
  if (tool === "create_playbook" || tool === "update_playbook") {
    const rc = args?.role_count;
    const n = typeof rc === "number" ? rc : null;
    return n != null ? (
      <Badge variant="outline" className="mt-1 h-4 border-zinc-600 text-[8px] text-zinc-400">
        {n} role{n === 1 ? "" : "s"}
      </Badge>
    ) : null;
  }
  if (tool === "create_host" || tool === "update_host") {
    const ip = strArg(args, "ip_address");
    const hid = strArg(args, "host_id");
    const show = ip || (tool === "update_host" ? hid : "");
    return show ? <span className="mt-0.5 block text-[9px] text-zinc-500">{show}</span> : null;
  }
  return null;
}

export function AiToolCallBlock({
  tool,
  args,
  compact,
  active,
  startedAt,
  runOutput,
  runId,
}: {
  tool: string;
  args?: Record<string, unknown> | null;
  compact?: boolean;
  active?: boolean;
  startedAt?: number;
  runOutput?: string;
  runId?: string;
}) {
  const hasArgs = args && Object.keys(args).filter((k) => k !== "summary").length > 0;
  const cat = toolUiCategory(tool);
  const isDelete = tool.startsWith("delete_");
  const summary = strArg(args, "summary") || tool;
  return (
    <details
      className={cn(
        "group/tc rounded-md border text-[10px] mr-8",
        isDelete ? "border-rose-500/40 bg-rose-500/[0.07]" : toolCallAccentClass(tool),
        active && "animate-pulse border-opacity-80",
      )}
      open={Boolean(active && runOutput)}
    >
      <summary className="flex items-center gap-1.5 text-zinc-300 font-medium px-3 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3 shrink-0 text-zinc-500 transition-transform group-open/tc:rotate-90" />
        {active ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-emerald-400/80" />
        ) : (
          <Wrench className="size-3 shrink-0 text-zinc-500" />
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
        <span className="min-w-0 flex-1 truncate text-left font-sans text-[11px] font-medium text-zinc-200">
          {summary}
        </span>
        <LiveElapsed startedAt={startedAt} active={Boolean(active)} />
        <span className="font-mono text-[9px] text-zinc-600">{tool}</span>
      </summary>
      <div className={cn("px-3 pb-2", compact && "max-h-20 overflow-hidden")}>
        <CallSummaryExtra tool={tool} args={args} />
        {(tool === "run_playbook" || tool === "run_role") && (
          <AiRunOutputBlock text={runOutput ?? ""} runId={runId} done={!active} />
        )}
        {hasArgs ? (
          <pre
            className={cn(
              "mt-2 text-zinc-500 font-mono whitespace-pre-wrap break-all",
              compact ? "max-h-16 overflow-y-auto" : "max-h-40 overflow-y-auto",
            )}
          >
            {JSON.stringify(
              Object.fromEntries(
                Object.entries(args!).filter(([k]) => k !== "summary"),
              ),
              null,
              2,
            )}
          </pre>
        ) : null}
      </div>
    </details>
  );
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function extractAnsibleOutput(preview: string): string {
  const marker = "--- output ---";
  const i = preview.indexOf(marker);
  if (i >= 0) return preview.slice(i + marker.length).trim();
  return preview;
}

function parseSshSections(preview: string): { exitCode: number | null; body: string } {
  const m = preview.match(/^exit_code=(-?\d+)/m);
  const exitCode = m ? parseInt(m[1], 10) : null;
  return { exitCode, body: preview };
}

export function AiToolResultBlock({
  tool,
  preview,
  outcome,
  resultType,
  exitCode,
  entityId,
  entityName,
  runStatus,
  elapsedMs,
}: {
  tool: string;
  preview: string;
  outcome?: string | null;
  resultType?: string | null;
  exitCode?: number | null;
  entityId?: string | null;
  entityName?: string | null;
  runStatus?: string | null;
  elapsedMs?: number | null;
}) {
  let ok = (outcome ?? "success") === "success";
  const denied = outcome === "denied";
  const cat = toolUiCategory(tool);
  const rt = resultType ?? "text";

  if (rt === "run" && exitCode != null && exitCode !== 0) ok = false;
  if (rt === "ssh" && exitCode != null && exitCode !== 0) ok = false;

  const entityLink =
    entityId &&
    (tool === "create_playbook" ||
      tool === "update_playbook" ||
      tool === "get_playbook" ||
      tool === "delete_playbook") ? (
      <Link
        to={`/playbooks/${entityId}`}
        className="text-[10px] text-sky-400 hover:underline"
      >
        Open playbook
      </Link>
    ) : entityId &&
      (tool === "create_role" ||
        tool === "update_role" ||
        tool === "get_role_detail" ||
        tool === "delete_role") ? (
      <Link
        to={`/roles/${entityId}`}
        className="text-[10px] text-sky-400 hover:underline"
      >
        Open role
      </Link>
    ) : null;

  const summaryLine = entityName ? (
    <span className="text-zinc-300">{entityName}</span>
  ) : (
    <span className="font-mono truncate">{tool}</span>
  );

  const innerBody = () => {
    if (rt === "run") {
      const ansible = extractAnsibleOutput(preview);
      return (
        <div className="space-y-2 px-3 pb-2">
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            {runStatus ? (
              <Badge variant="outline" className="h-4 text-[8px] capitalize">
                {runStatus}
              </Badge>
            ) : null}
            {exitCode != null ? (
              <Badge
                variant="outline"
                className={cn(
                  "h-4 text-[8px]",
                  exitCode === 0
                    ? "border-emerald-500/50 text-emerald-400"
                    : "border-rose-500/50 text-rose-400",
                )}
              >
                exit {exitCode}
              </Badge>
            ) : null}
            {entityId ? (
              <span className="font-mono text-[9px] text-zinc-500">run {entityId.slice(0, 8)}…</span>
            ) : null}
          </div>
          {ansible ? (
            <pre className="max-h-40 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-2 font-mono text-[9px] whitespace-pre-wrap break-all text-zinc-400">
              {ansible}
            </pre>
          ) : null}
        </div>
      );
    }
    if (rt === "ssh") {
      const { body } = parseSshSections(preview);
      return (
        <div className="space-y-2 px-3 pb-2">
          {exitCode != null ? (
            <Badge
              variant="outline"
              className={cn(
                "h-4 text-[8px]",
                exitCode === 0
                  ? "border-emerald-500/50 text-emerald-400"
                  : "border-rose-500/50 text-rose-400",
              )}
            >
              exit {exitCode}
            </Badge>
          ) : null}
          <pre className="max-h-40 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-2 font-mono text-[9px] whitespace-pre-wrap break-all text-zinc-400">
            {body}
          </pre>
        </div>
      );
    }
    if (
      rt === "crud_create" ||
      rt === "crud_update" ||
      rt === "crud_generic" ||
      rt === "json_host"
    ) {
      return (
        <div className="space-y-2 px-3 pb-2 text-[10px]">
          <div className="flex flex-wrap items-center gap-2">
            {entityName ? <span className="text-zinc-300">{entityName}</span> : null}
            {entityId ? (
              <span className="font-mono text-[9px] text-zinc-500">{entityId}</span>
            ) : null}
            {entityLink}
          </div>
          {preview && rt === "json_host" ? (
            <pre className="max-h-32 overflow-y-auto text-[9px] text-zinc-500">{preview}</pre>
          ) : preview && !entityName ? (
            <pre className="max-h-32 overflow-y-auto text-[9px] text-zinc-500">{preview}</pre>
          ) : null}
        </div>
      );
    }
    if (rt === "delete") {
      return (
        <p className="px-3 pb-2 text-[10px] text-zinc-400">{preview}</p>
      );
    }
    return preview ? (
      <pre className="px-3 pb-2 text-zinc-500 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto text-[9px]">
        {preview}
      </pre>
    ) : null;
  };

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
        {summaryLine}
        {outcome ? (
          <span className="text-zinc-600 uppercase tracking-wide text-[8px]">{outcome}</span>
        ) : null}
        {elapsedMs != null ? (
          <span className="ml-auto text-[9px] tabular-nums text-zinc-600">{formatElapsed(elapsedMs)}</span>
        ) : null}
      </summary>
      {innerBody()}
    </details>
  );
}

export function AiThinkingBlock({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="mr-8 rounded-md border border-zinc-700/50 bg-zinc-900/40 px-3.5 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-zinc-600 mb-1 text-[10px]">
        <Brain className="size-3" />
        <span className="uppercase tracking-wide">Reasoning</span>
      </div>
      <pre className="text-zinc-500 text-[10px] leading-relaxed whitespace-pre-wrap break-words">
        {text}
      </pre>
    </div>
  );
}

export type LiveToolCallBlock = {
  kind: "call";
  tool: string;
  args?: Record<string, unknown>;
  startedAt: number;
  runOutput?: string;
  runId?: string;
};

export type LiveToolResultBlock = {
  kind: "result";
  tool: string;
  result: string;
  startedAt?: number;
  resultType?: string;
  exitCode?: number | null;
  entityId?: string | null;
  entityName?: string | null;
  runStatus?: string | null;
  outcome?: string | null;
  elapsedMs?: number | null;
};

export type LiveStreamBlock =
  | { kind: "user"; text: string }
  | { kind: "thinking"; text: string }
  | LiveToolCallBlock
  | LiveToolResultBlock;
