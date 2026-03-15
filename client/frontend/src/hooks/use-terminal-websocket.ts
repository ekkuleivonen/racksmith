import { useEffect, useRef, type RefObject } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { TERMINAL_THEME } from "@/lib/terminal";

interface UseTerminalWebSocketOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  url: string | null;
  interactive?: boolean;
  visible?: boolean;
  initialOutput?: string;
  onMessage?: (payload: unknown, terminal: Terminal) => void;
  onOpen?: (socket: WebSocket, terminal: Terminal) => void;
  onClose?: (event: CloseEvent, terminal: Terminal) => void;
  onError?: (terminal: Terminal) => void;
}

export function useTerminalWebSocket({
  containerRef,
  url,
  interactive = false,
  visible = true,
  initialOutput,
  onMessage,
  onOpen,
  onClose,
  onError,
}: UseTerminalWebSocketOptions) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!url || !containerRef.current) return;

    const container = containerRef.current;
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: interactive,
      disableStdin: !interactive,
      fontFamily: "JetBrains Mono Variable, monospace",
      fontSize: 12,
      lineHeight: 1.2,
      theme: TERMINAL_THEME,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    if (initialOutput) {
      terminal.write(initialOutput);
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const sendResize = (sock: WebSocket) => {
      if (sock.readyState !== WebSocket.OPEN) return;
      sock.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows,
        }),
      );
    };

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (interactive && socketRef.current) {
        sendResize(socketRef.current);
      }
    });
    resizeObserver.observe(container);

    let dataDisposable: { dispose: () => void } | undefined;
    const socket = new WebSocket(url);
    socketRef.current = socket;

    if (interactive) {
      dataDisposable = terminal.onData((data) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: "input", data }));
      });
    }

    socket.onopen = () => {
      if (interactive) sendResize(socket);
      onOpen?.(socket, terminal);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (interactive && payload?.type === "connected") {
          sendResize(socket);
        }
        onMessage?.(payload, terminal);
      } catch {
        terminal.write(String(event.data));
      }
    };

    socket.onclose = (event) => {
      onClose?.(event, terminal);
    };

    socket.onerror = () => {
      if (onError) onError(terminal);
      else terminal.writeln("\r\n[websocket error]");
    };

    return () => {
      resizeObserver.disconnect();
      dataDisposable?.dispose();
      if (interactive && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "close" }));
      }
      socket.close();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      socketRef.current = null;
    };
    // containerRef is stable; refs excluded from deps per React guidelines
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, interactive, initialOutput, onMessage, onOpen, onClose, onError]);

  useEffect(() => {
    if (!visible) return;
    const fit = fitAddonRef.current;
    const sock = socketRef.current;
    const term = terminalRef.current;
    if (!fit || !term) return;
    requestAnimationFrame(() => {
      fit.fit();
      if (interactive && sock && sock.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
  }, [visible, interactive]);

  return { terminalRef };
}
