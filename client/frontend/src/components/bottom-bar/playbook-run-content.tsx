import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useTerminalWebSocket } from "@/hooks/use-terminal-websocket";
import {
  playbookRunStreamUrl,
  type PlaybookRun,
} from "@/lib/playbooks";
import { useBottomBarStore } from "@/stores/bottom-bar";
import { cn } from "@/lib/utils";

type PlaybookRunContentProps = {
  runId: string;
  playbookName: string;
  /** Shown from tab store; updated via WebSocket */
  status: string;
};

export function PlaybookRunContent({
  runId,
  playbookName,
  status,
}: PlaybookRunContentProps) {
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const renderedOutputRef = useRef("");
  const updatePlaybookRunTab = useBottomBarStore((s) => s.updatePlaybookRunTab);

  const handlePlaybookMessage = useCallback(
    (payload: unknown, terminal: import("xterm").Terminal) => {
      const p = payload as {
        type?: string;
        run?: PlaybookRun;
        data?: string;
        message?: string;
      };
      if (p.type === "error") {
        toast.error(p.message ?? "Playbook run error");
        return;
      }
      if (p.type === "snapshot" || p.type === "status") {
        if (p.run) {
          updatePlaybookRunTab(runId, { status: p.run.status });
          if (p.run.output !== renderedOutputRef.current) {
            terminal.clear();
            if (p.run.output) terminal.write(String(p.run.output));
            renderedOutputRef.current = String(p.run.output || "");
          }
        }
      }
      if (p.type === "output") {
        const chunk = String(p.data ?? "");
        terminal.write(chunk);
        renderedOutputRef.current += chunk;
      }
    },
    [runId, updatePlaybookRunTab],
  );

  const handlePlaybookError = useCallback(() => {
    // Suppress — the run may already be done; server closed the socket.
  }, []);

  useTerminalWebSocket({
    containerRef: terminalHostRef,
    url: playbookRunStreamUrl(runId),
    interactive: false,
    initialOutput: "",
    onMessage: handlePlaybookMessage,
    onError: handlePlaybookError,
  });

  const statusLabel =
      status === "queued"
        ? "Queued"
        : status === "running"
          ? "Running..."
          : status === "completed"
            ? "Completed"
            : status === "failed"
              ? "Failed"
              : status;

  const statusColor =
    status === "completed"
      ? "text-emerald-400"
      : status === "failed"
        ? "text-red-400"
        : "text-zinc-400";

  return (
    <div className="h-full flex flex-col min-h-0 bg-[#09090b]">
      <div className="shrink-0 px-3 py-2 border-b border-zinc-800/60">
        <p className="text-[11px] font-medium text-zinc-200 truncate">
          {playbookName}
        </p>
        <p className={cn("text-[10px]", statusColor)}>{statusLabel}</p>
      </div>
      <div className="flex-1 min-h-0 border-t border-zinc-800/40 p-2">
        <div
          ref={terminalHostRef}
          className="h-full w-full min-h-[12rem] overflow-hidden"
        />
      </div>
    </div>
  );
}
