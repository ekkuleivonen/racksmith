import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { Button } from "@/components/ui/button";
import { sshTerminalUrl } from "@/lib/ssh";
import type { Host } from "@/lib/hosts";

interface SshTerminalProps {
  hostId: string;
  host: Host;
  title?: string;
  description?: string;
}

export function SshTerminal({
  hostId,
  host,
  title,
  description,
}: SshTerminalProps) {
  const [enabled, setEnabled] = useState(false);
  const [, setConnected] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!enabled || !hostRef.current) return;

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
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
    terminal.open(hostRef.current);
    fitAddon.fit();
    terminal.writeln(
      `Opening SSH session to ${host.ssh_user}@${host.ip_address}:${host.ssh_port}...`,
    );

    const socket = new WebSocket(sshTerminalUrl(hostId));
    socketRef.current = socket;
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const sendResize = () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows,
        }),
      );
    };

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      sendResize();
    });
    resizeObserver.observe(hostRef.current);

    const dataDisposable = terminal.onData((data) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "input", data }));
    });

    socket.onopen = () => {
      terminal.writeln("[websocket connected]");
      sendResize();
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        if (payload.type === "connected") {
          setConnected(true);
          terminal.writeln(
            `[connected to ${payload.ssh_user}@${payload.ip_address}:${payload.ssh_port}]`,
          );
          sendResize();
          return;
        }
        if (payload.type === "output") {
          terminal.write(String(payload.data));
          return;
        }
        if (payload.type === "error") {
          terminal.writeln(`\r\n[error] ${String(payload.message)}`);
        }
      } catch {
        terminal.write(String(event.data));
      }
    };

    socket.onclose = (event) => {
      setConnected(false);
      terminal.writeln(
        `\r\n[session closed${event.reason ? `: ${event.reason}` : `, code ${event.code}`}]`,
      );
    };

    socket.onerror = () => {
      terminal.writeln("\r\n[ssh session error]");
    };

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      setConnected(false);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "close" }));
      }
      socket.close();
      terminal.dispose();
      socketRef.current = null;
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [enabled, host.ip_address, host.id, host.ssh_port, host.ssh_user, hostId]);

  useEffect(() => {
    setEnabled(false);
    setConnected(false);
    socketRef.current?.close();
    terminalRef.current?.dispose();
    socketRef.current = null;
    terminalRef.current = null;
    fitAddonRef.current = null;
  }, [host.id]);

  const closeSession = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "close" }));
    }
    socketRef.current?.close();
    terminalRef.current?.dispose();
    socketRef.current = null;
    terminalRef.current = null;
    fitAddonRef.current = null;
    setConnected(false);
    setEnabled(false);
  };

  const hasHeader = title || description;

  if (!enabled) {
    return (
      <div className="space-y-2">
        {hasHeader ? (
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5 text-[11px] text-zinc-500 min-w-0">
              {title ? (
                <h2 className="text-zinc-100 font-semibold text-sm">{title}</h2>
              ) : null}
              {description ? (
                <p className="text-zinc-500">{description}</p>
              ) : null}
            </div>
            <Button
              size="sm"
              onClick={() => setEnabled(true)}
              className="shrink-0"
            >
              Open SSH session
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => setEnabled(true)}>
            Open SSH session
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3 text-[11px] text-zinc-500">
        <div className="flex flex-col gap-0.5 min-w-0">
          {title ? (
            <h2 className="text-zinc-100 font-semibold text-sm">{title}</h2>
          ) : null}
          {description ? <p className="text-zinc-500">{description}</p> : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => {
              terminalRef.current?.clear();
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={closeSession}
          >
            Close
          </Button>
        </div>
      </div>
      <div className="border border-zinc-800 bg-zinc-950 h-[min(34rem,60vh)] min-h-[18rem] p-2">
        <div ref={hostRef} className="h-full w-full overflow-hidden" />
      </div>
    </div>
  );
}
