import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Locate, MessageSquare, Power, RefreshCw, Terminal } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createAiChat, streamAiChatTurn } from "@/lib/ai-chat";
import { toastApiError } from "@/lib/api";
import { useRebootHost, useRefreshHost, useRelocateHost } from "@/hooks/mutations";
import { useBottomBarStore } from "@/stores/bottom-bar";
import { cn } from "@/lib/utils";

export type HostCanvasFloatingMenuState = {
  x: number;
  y: number;
  hostId: string;
  hostLabel: string;
  sshEnabled: boolean;
  relocateEnabled: boolean;
};

function useHostMenuHandlers(hostId: string, hostLabel: string) {
  const navigate = useNavigate();
  const openSshSession = useBottomBarStore((s) => s.openSshSession);
  const openAiChatTab = useBottomBarStore((s) => s.openAiChatTab);

  const openDetails = useCallback(() => {
    navigate(`/hosts/${hostId}`);
  }, [navigate, hostId]);

  const openSsh = useCallback(() => {
    openSshSession(hostId, hostLabel);
  }, [openSshSession, hostId, hostLabel]);

  const openChat = useCallback(async () => {
    try {
      const { chat_id } = await createAiChat();
      openAiChatTab(chat_id, hostLabel);
      await streamAiChatTurn(chat_id, {
        content: `I want to work with host "${hostLabel}".`,
        context: { hosts: [hostId] },
      });
    } catch (e) {
      toastApiError(e, "Failed to create chat");
    }
  }, [openAiChatTab, hostId, hostLabel]);

  return { openDetails, openSsh, openChat };
}

function useHostLifecycleActions(hostId: string) {
  const refreshMutation = useRefreshHost();
  const relocateMutation = useRelocateHost();
  const rebootMutation = useRebootHost();
  return {
    probe: () => refreshMutation.mutate(hostId),
    relocate: () => relocateMutation.mutate(hostId),
    reboot: () => rebootMutation.mutate(hostId),
    probePending: refreshMutation.isPending,
    relocatePending: relocateMutation.isPending,
    rebootPending: rebootMutation.isPending,
  };
}

export function HostContextMenu({
  hostId,
  hostLabel,
  sshEnabled,
  relocateEnabled,
  children,
}: {
  hostId: string;
  hostLabel: string;
  /** When false, SSH / probe / reboot are disabled (missing connection info). */
  sshEnabled: boolean;
  /** When false, Relocate IP is disabled (no MAC on record). */
  relocateEnabled: boolean;
  children: React.ReactNode;
}) {
  const { openDetails, openSsh, openChat } = useHostMenuHandlers(hostId, hostLabel);
  const {
    probe,
    relocate,
    reboot,
    probePending,
    relocatePending,
    rebootPending,
  } = useHostLifecycleActions(hostId);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={openDetails}>
          <ExternalLink className="size-3.5" />
          Open details
        </ContextMenuItem>
        <ContextMenuItem disabled={!sshEnabled} onSelect={openSsh}>
          <Terminal className="size-3.5" />
          Open SSH
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            void openChat();
          }}
        >
          <MessageSquare className="size-3.5" />
          Open chat
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!sshEnabled || probePending}
          onSelect={() => probe()}
        >
          <RefreshCw className={cn("size-3.5", probePending && "animate-spin")} />
          Probe host
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!relocateEnabled || relocatePending}
          onSelect={() => relocate()}
        >
          <Locate className={cn("size-3.5", relocatePending && "animate-spin")} />
          Relocate IP
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!sshEnabled || rebootPending}
          onSelect={() => reboot()}
        >
          <Power className="size-3.5" />
          Reboot
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function HostCanvasFloatingMenuInner({
  state,
  onClose,
}: {
  state: HostCanvasFloatingMenuState;
  onClose: () => void;
}) {
  const { openDetails, openSsh, openChat } = useHostMenuHandlers(state.hostId, state.hostLabel);
  const {
    probe,
    relocate,
    reboot,
    probePending,
    relocatePending,
    rebootPending,
  } = useHostLifecycleActions(state.hostId);

  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="fixed z-50 size-px min-h-px min-w-px border-0 p-0 opacity-0"
          style={{ left: state.x, top: state.y }}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-52"
        align="start"
        side="bottom"
        sideOffset={0}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuItem
          onClick={() => {
            openDetails();
            onClose();
          }}
        >
          <ExternalLink className="size-3.5" />
          Open details
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!state.sshEnabled}
          onClick={() => {
            openSsh();
            onClose();
          }}
        >
          <Terminal className="size-3.5" />
          Open SSH
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void (async () => {
              try {
                await openChat();
              } finally {
                onClose();
              }
            })();
          }}
        >
          <MessageSquare className="size-3.5" />
          Open chat
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!state.sshEnabled || probePending}
          onClick={() => {
            probe();
            onClose();
          }}
        >
          <RefreshCw className={cn("size-3.5", probePending && "animate-spin")} />
          Probe host
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!state.relocateEnabled || relocatePending}
          onClick={() => {
            relocate();
            onClose();
          }}
        >
          <Locate className={cn("size-3.5", relocatePending && "animate-spin")} />
          Relocate IP
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!state.sshEnabled || rebootPending}
          onClick={() => {
            reboot();
            onClose();
          }}
        >
          <Power className="size-3.5" />
          Reboot
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Right-click menu for graph views (e.g. React Flow) where ContextMenuTrigger cannot wrap nodes. */
export function HostCanvasFloatingMenu({
  state,
  onClose,
}: {
  state: HostCanvasFloatingMenuState | null;
  onClose: () => void;
}) {
  if (!state) return null;
  return <HostCanvasFloatingMenuInner state={state} onClose={onClose} />;
}
