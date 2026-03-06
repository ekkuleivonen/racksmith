import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { Button } from "@/components/ui/button";
import { sshTerminalUrl } from "@/lib/ssh";
import type { RackItem } from "@/lib/racks";

interface SshTerminalProps {
  rackId: string;
  item: RackItem;
}

export function SshTerminal({ rackId, item }: SshTerminalProps) {
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
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
      `Opening SSH session to ${item.ssh_user}@${item.host}:${item.ssh_port}...`,
    );

    const socket = new WebSocket(sshTerminalUrl(rackId, item.id));
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
            `[connected to ${payload.ssh_user}@${payload.host}:${payload.ssh_port}]`,
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
  }, [enabled, item.host, item.id, item.ssh_port, item.ssh_user, rackId]);

  useEffect(() => {
    setEnabled(false);
    setConnected(false);
    socketRef.current?.close();
    terminalRef.current?.dispose();
    socketRef.current = null;
    terminalRef.current = null;
    fitAddonRef.current = null;
  }, [item.id]);

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

  if (!enabled) {
    return (
      <div className="space-y-2">
        <Button size="sm" onClick={() => setEnabled(true)}>
          Open SSH session
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>
          {connected ? "Connected" : "Connecting"} • {item.ssh_user}@{item.host}
          :{item.ssh_port}
        </span>
        <div className="flex items-center gap-1">
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
      <div className="border border-zinc-800 bg-zinc-950 h-[36rem] p-2">
        <div ref={hostRef} className="h-full w-full overflow-hidden" />
      </div>
    </div>
  );
}
