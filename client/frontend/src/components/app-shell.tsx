import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { BottomBarLayout } from "@/components/bottom-bar/bottom-bar-layout";
import { useBottomBarStore } from "@/stores/bottom-bar";
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

type AppShellProps = {
  children: ReactNode;
  title: string;
};

export function AppShell({ children }: AppShellProps) {
  const { loading, publicKeyDialog } = useAppShellState();
  const tabs = useBottomBarStore((s) => s.tabs);

  const mainContent = (
    <main className="h-full flex-1 min-w-0 flex flex-col min-h-0">{children}</main>
  );

  const mainArea =
    tabs.length > 0 ? (
      <BottomBarLayout>{mainContent}</BottomBarLayout>
    ) : (
      mainContent
    );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading workspace...</p>
      </div>
    );
  }

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
        <ResizablePanel defaultSize={85} minSize={30} className="min-w-0 min-h-0">
          {mainArea}
        </ResizablePanel>
      </ResizablePanelGroup>
      {publicKeyDialog}
      <CommandPalette />
    </div>
  );
}
