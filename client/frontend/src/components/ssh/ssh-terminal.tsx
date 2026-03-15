import { useCallback, useRef, useState } from "react";
import type { Terminal } from "xterm";
import { Button } from "@/components/ui/button";
import { sshTerminalUrl } from "@/lib/ssh";
import { useTerminalWebSocket } from "@/hooks/use-terminal-websocket";
import type { Host } from "@/lib/hosts";

interface SshTerminalProps {
  hostId: string;
  host: Host;
  autoConnect?: boolean;
  visible?: boolean;
}

interface SshPayload {
  type: string;
  data?: string;
  message?: string;
}

export function SshTerminal({
  hostId,
  host,
  autoConnect = false,
  visible = true,
}: SshTerminalProps) {
  const [enabled, setEnabled] = useState(autoConnect);
  const [, setConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useTerminalWebSocket({
    containerRef,
    url: enabled ? sshTerminalUrl(hostId) : null,
    interactive: true,
    visible,
    onMessage: useCallback((payload: unknown, terminal: Terminal) => {
      const p = payload as SshPayload;
      if (p.type === "connected") {
        setConnected(true);
        return;
      }
      if (p.type === "output") {
        terminal.write(String(p.data ?? ""));
        return;
      }
      if (p.type === "error") {
        terminal.writeln(`\r\n[error] ${String(p.message ?? "")}`);
      }
    }, []),
    onClose: useCallback((event: CloseEvent, terminal: Terminal) => {
      setConnected(false);
      terminal.writeln(
        `\r\n[session closed${event.reason ? `: ${event.reason}` : `, code ${event.code}`}]`,
      );
    }, []),
    onError: useCallback((terminal: Terminal) => {
      terminal.writeln("\r\n[ssh session error]");
    }, []),
  });

  const [prevHostId, setPrevHostId] = useState(host.id);
  if (prevHostId !== host.id) {
    setPrevHostId(host.id);
    if (!autoConnect) {
      setEnabled(false);
    }
    setConnected(false);
  }

  if (!enabled) {
    return (
      <div className="h-full flex items-center justify-center">
        <Button size="sm" onClick={() => setEnabled(true)}>
          Open SSH session
        </Button>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
