import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { Button } from "@/components/ui/button";
import { playbookRunStreamUrl, type PlaybookRun } from "@/lib/playbooks";

interface PlaybookRunOutputProps {
  run: PlaybookRun | null;
  onRunUpdate?: (run: PlaybookRun) => void;
}

export function PlaybookRunOutput({ run, onRunUpdate }: PlaybookRunOutputProps) {
  const [activeRun, setActiveRun] = useState<PlaybookRun | null>(run);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const renderedOutputRef = useRef("");

  useEffect(() => {
    setActiveRun(run);
  }, [run]);

  useEffect(() => {
    if (!activeRun || !terminalHostRef.current) return;

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: false,
      disableStdin: true,
      fontFamily: "JetBrains Mono Variable, monospace",
      fontSize: 12,
      lineHeight: 1.2,
      theme: {
        background: "#09090b",
        foreground: "#e4e4e7",
        cursor: "#fafafa",
        selectionBackground: "#3f3f46",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalHostRef.current);
    fitAddon.fit();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    renderedOutputRef.current = activeRun.output;
    if (activeRun.output) {
      terminal.write(activeRun.output);
    }

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalHostRef.current);

    const socket = new WebSocket(playbookRunStreamUrl(activeRun.id));
    socket.onmessage = (event) => {
      const payload = JSON.parse(String(event.data));
      if (payload.type === "snapshot" || payload.type === "status") {
        setActiveRun(payload.run);
        onRunUpdate?.(payload.run);
        if (terminalRef.current && payload.run?.output !== renderedOutputRef.current) {
          terminalRef.current.clear();
          if (payload.run?.output) {
            terminalRef.current.write(String(payload.run.output));
          }
          renderedOutputRef.current = String(payload.run?.output || "");
        }
      }
      if (payload.type === "output") {
        const nextChunk = String(payload.data ?? "");
        if (terminalRef.current) {
          terminalRef.current.write(nextChunk);
          renderedOutputRef.current += nextChunk;
        }
        setActiveRun((current) => {
          if (!current) return current;
          const nextRun = { ...current, output: `${current.output}${nextChunk}` };
          onRunUpdate?.(nextRun);
          return nextRun;
        });
      }
    };
    return () => {
      resizeObserver.disconnect();
      socket.close();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [activeRun?.id, onRunUpdate]);

  const statusLabel = useMemo(() => {
    if (!activeRun) return "";
    if (activeRun.status === "queued") return "Queued";
    if (activeRun.status === "running") return "Running";
    if (activeRun.status === "completed") return "Completed";
    return "Failed";
  }, [activeRun]);

  if (!activeRun) {
    return (
      <section className="border border-zinc-800 bg-zinc-900/30 p-4">
        <p className="text-zinc-500 text-sm">Run a playbook to stream its output here.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-zinc-100 font-medium">{activeRun.playbook_name}</p>
          <p className="text-xs text-zinc-500">
            {activeRun.hosts.length} host{activeRun.hosts.length === 1 ? "" : "s"} · {statusLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeRun.status === "running" || activeRun.status === "queued" ? (
            <LoaderCircle className="size-4 animate-spin text-zinc-400" />
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => {
              renderedOutputRef.current = "";
              terminalRef.current?.clear();
              terminalRef.current?.write("[cleared]");
              setActiveRun((current) => (current ? { ...current, output: "" } : current));
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="space-y-1 text-xs text-zinc-500">
        <p>Targets: {activeRun.hosts.join(", ")}</p>
        {activeRun.exit_code !== null ? <p>Exit code: {activeRun.exit_code}</p> : null}
      </div>

      <div className="border border-zinc-800 bg-zinc-950 h-[26rem] p-2">
        <div ref={terminalHostRef} className="h-full w-full overflow-hidden" />
      </div>
    </section>
  );
}
