import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { usePanelRef } from "react-resizable-panels";
import { ChevronUp, Copy, RefreshCw, Terminal, X } from "lucide-react";
import { toast } from "sonner";
import { SshBottomPanel } from "@/components/canvas/ssh-bottom-panel";
import { useSshStore } from "@/stores/ssh";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Sidebar } from "@/components/sidebar/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { useSetupStore } from "@/stores/setup";
import { useHosts } from "@/hooks/queries";
import { usePingStore } from "@/stores/ping";
import { isManagedHost } from "@/lib/hosts";
import { cn } from "@/lib/utils";

function useAppShellState() {
  const loading = useSetupStore((s) => s.loading);
  const status = useSetupStore((s) => s.status);
  const publicKeyOpen = useSetupStore((s) => s.publicKeyOpen);
  const publicKey = useSetupStore((s) => s.publicKey);
  const loadingPublicKey = useSetupStore((s) => s.loadingPublicKey);
  const setPublicKeyOpen = useSetupStore((s) => s.setPublicKeyOpen);
  const generateKey = useSetupStore((s) => s.generateKey);
  const generatingKey = useSetupStore((s) => s.generatingKey);
  const loadSetup = useSetupStore((s) => s.load);

  const { data: hosts = [] } = useHosts();
  const managedHosts = useMemo(() => hosts.filter(isManagedHost), [hosts]);
  const startPolling = usePingStore((s) => s.startPolling);
  const stopPolling = usePingStore((s) => s.stopPolling);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    if (!status?.repo_ready || managedHosts.length === 0) {
      stopPolling();
      return;
    }
    const targets = managedHosts.map((host) => ({ host_id: host.id }));
    startPolling(targets);
    return () => {
      stopPolling();
    };
  }, [
    status?.repo_ready,
    status?.repo?.full_name,
    managedHosts,
    startPolling,
    stopPolling,
  ]);

  const copyPublicKey = useCallback(async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      toast.success("Public key copied");
    } catch {
      toast.error("Failed to copy public key");
    }
  }, [publicKey]);

  const publicKeyDialog = (
    <AlertDialog open={publicKeyOpen} onOpenChange={setPublicKeyOpen}>
      <AlertDialogContent size="md">
        <AlertDialogHeader className="items-start text-left">
          <AlertDialogTitle>Racksmith public key</AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            Add this key to the target host&apos;s `authorized_keys` so
            Racksmith can SSH in without a password.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <textarea
            readOnly
            value={loadingPublicKey ? "Loading public key..." : publicKey}
            className="min-h-28 w-full rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-[11px] text-zinc-200 outline-none resize-none"
          />
          {!loadingPublicKey && !publicKey ? (
            <p className="text-[11px] text-zinc-500">
              No SSH key found. Generate one to allow Racksmith to connect to
              your hosts.
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          {!publicKey && !loadingPublicKey ? (
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void generateKey();
              }}
              disabled={generatingKey}
            >
              <RefreshCw
                className={`size-3 ${generatingKey ? "animate-spin" : ""}`}
              />
              {generatingKey ? "Generating..." : "Generate key"}
            </AlertDialogAction>
          ) : (
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void copyPublicKey();
              }}
              disabled={!publicKey || loadingPublicKey}
            >
              <Copy className="size-3" />
              Copy
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { loading, publicKeyDialog };
}

function SshMinimizedBar() {
  const tabs = useSshStore((s) => s.tabs);
  const activeTabId = useSshStore((s) => s.activeTabId);
  const setActiveTab = useSshStore((s) => s.setActiveTab);
  const closeAllSessions = useSshStore((s) => s.closeAllSessions);

  const expand = useCallback((tabId?: string) => {
    if (tabId) setActiveTab(tabId);
    useSshStore.setState({ panelOpen: true });
  }, [setActiveTab]);

  return (
    <div className="flex items-center h-8 bg-[#09090b] border-t border-zinc-800/60 px-2 gap-1 shrink-0">
      <Terminal className="size-3 text-zinc-500 mr-1" />
      <div className="flex-1 flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => expand(tab.id)}
            className={cn(
              "px-2 py-0.5 text-[10px] rounded-sm transition-colors truncate max-w-[120px] shrink-0",
              tab.id === activeTabId
                ? "bg-zinc-800 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="size-5 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
        onClick={() => expand()}
        aria-label="Expand SSH panel"
      >
        <ChevronUp className="size-3" />
      </button>
      <button
        type="button"
        className="size-5 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
        onClick={closeAllSessions}
        aria-label="Close all SSH sessions"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

type AppShellProps = {
  children: ReactNode;
  title: string;
};

export function AppShell({ children }: AppShellProps) {
  const { loading, publicKeyDialog } = useAppShellState();
  const sshPanelOpen = useSshStore((s) => s.panelOpen);
  const sshTabs = useSshStore((s) => s.tabs);
  const hasTabs = sshTabs.length > 0;

  const sshPanelRef = usePanelRef();

  useEffect(() => {
    if (!hasTabs) return;
    const panel = sshPanelRef.current;
    if (!panel) return;
    if (sshPanelOpen) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [sshPanelOpen, hasTabs, sshPanelRef]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading workspace...</p>
      </div>
    );
  }

  const mainContent = (
    <main className="h-full flex-1 min-w-0 flex flex-col">{children}</main>
  );

  const mainArea = hasTabs ? (
    <div className="h-full flex flex-col">
      <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={60} minSize={15}>
          {mainContent}
        </ResizablePanel>
        <ResizableHandle className="bg-zinc-700/50 hover:bg-zinc-600/50 transition-colors" />
        <ResizablePanel
          panelRef={sshPanelRef}
          defaultSize={40}
          minSize={10}
          collapsible
          collapsedSize={0}
          onResize={(size) => {
            const collapsed = size.asPercentage === 0;
            const storeOpen = useSshStore.getState().panelOpen;
            if (collapsed && storeOpen) useSshStore.setState({ panelOpen: false });
            else if (!collapsed && !storeOpen) useSshStore.setState({ panelOpen: true });
          }}
        >
          <SshBottomPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
      {!sshPanelOpen && <SshMinimizedBar />}
    </div>
  ) : (
    mainContent
  );

  return (
    <div className="h-screen bg-zinc-950 flex overflow-hidden">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel
          defaultSize={15}
          minSize={10}
          collapsible
          className="min-w-0"
        >
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-zinc-800" />
        <ResizablePanel defaultSize={85} minSize={30} className="min-w-0">
          {mainArea}
        </ResizablePanel>
      </ResizablePanelGroup>
      {publicKeyDialog}
      <CommandPalette />
    </div>
  );
}
