import { type ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Copy } from "lucide-react";
import { toast } from "sonner";
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
import { useAuth } from "@/context/auth-context";
import { useSetupStore } from "@/stores/setup";
import { useRackStore } from "@/stores/racks";
import { usePlaybookStore } from "@/stores/playbooks";
import { usePingStore } from "@/stores/ping";

type AppShellProps = {
  children: ReactNode;
  title: string;
};

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();

  const loading = useSetupStore((s) => s.loading);
  const status = useSetupStore((s) => s.status);
  const publicKeyOpen = useSetupStore((s) => s.publicKeyOpen);
  const publicKey = useSetupStore((s) => s.publicKey);
  const loadingPublicKey = useSetupStore((s) => s.loadingPublicKey);
  const setPublicKeyOpen = useSetupStore((s) => s.setPublicKeyOpen);
  const loadSetup = useSetupStore((s) => s.load);
  const loadRacks = useRackStore((s) => s.load);
  const loadPlaybooks = usePlaybookStore((s) => s.load);

  const rackEntries = useRackStore((s) => s.rackEntries);
  const startPolling = usePingStore((s) => s.startPolling);
  const stopPolling = usePingStore((s) => s.stopPolling);

  useEffect(() => {
    void Promise.all([loadSetup(), loadRacks(), loadPlaybooks()]);
  }, [location.pathname, loadSetup, loadRacks, loadPlaybooks]);

  useEffect(() => {
    if (!status?.repo_ready || rackEntries.length === 0) {
      stopPolling();
      return;
    }
    const targets = rackEntries.flatMap(({ rack, items }) =>
      items.map((item) => ({ rack_id: rack.id, item_id: item.id })),
    );
    startPolling(targets);
    return () => {
      stopPolling();
    };
  }, [
    status?.repo_ready,
    status?.repo?.full_name,
    rackEntries,
    startPolling,
    stopPolling,
  ]);

  const copyPublicKey = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      toast.success("Public key copied");
    } catch {
      toast.error("Failed to copy public key");
    }
  };

  const { logout } = useAuth();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading workspace...</p>
      </div>
    );
  }

  if (!status?.repo_ready) {
    return <Navigate to="/" replace />;
  }

  if (!status.rack_ready && !location.pathname.startsWith("/rack")) {
    return <Navigate to="/rack/create" replace />;
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
          <Sidebar onLogout={logout} />
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-zinc-800" />
        <ResizablePanel defaultSize={85} minSize={30} className="min-w-0">
          <main className="h-full flex-1 min-w-0 overflow-auto">
            {children}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>

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
                No local public SSH key was found on this Racksmith machine.
              </p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
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
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
