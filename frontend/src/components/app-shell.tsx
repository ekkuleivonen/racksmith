import { type ReactNode, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Copy, RefreshCw } from "lucide-react";
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
import { useNodesStore } from "@/stores/nodes";
import { useStackStore } from "@/stores/stacks";
import { useGroupsStore } from "@/stores/groups";
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
  const generateKey = useSetupStore((s) => s.generateKey);
  const generatingKey = useSetupStore((s) => s.generatingKey);
  const loadSetup = useSetupStore((s) => s.load);
  const loadRacks = useRackStore((s) => s.load);
  const loadNodes = useNodesStore((s) => s.load);
  const loadStacks = useStackStore((s) => s.load);
  const loadGroups = useGroupsStore((s) => s.load);

  const nodes = useNodesStore((s) => s.nodes);
  const startPolling = usePingStore((s) => s.startPolling);
  const stopPolling = usePingStore((s) => s.stopPolling);

  useEffect(() => {
    void Promise.all([loadSetup(), loadRacks(), loadNodes(), loadStacks(), loadGroups()]);
  }, [location.pathname, loadSetup, loadRacks, loadNodes, loadStacks, loadGroups]);

  useEffect(() => {
    if (!status?.repo_ready || nodes.length === 0) {
      stopPolling();
      return;
    }
    const targets = nodes.map((node) => ({ node_slug: node.slug }));
    startPolling(targets);
    return () => {
      stopPolling();
    };
  }, [
    status?.repo_ready,
    status?.repo?.full_name,
    nodes,
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

  const navigate = useNavigate();
  const { logout } = useAuth();
  const handleLogout = useCallback(() => {
    logout();
    navigate("/");
  }, [logout, navigate]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading workspace...</p>
      </div>
    );
  }

  const isOnboarding =
    location.pathname.startsWith("/nodes/create") ||
    location.pathname === "/rack/create" ||
    location.pathname === "/racks";

  const alertDialog = (
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
              No SSH key found. Generate one to allow Racksmith to connect to your nodes.
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
              <RefreshCw className={`size-3 ${generatingKey ? "animate-spin" : ""}`} />
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

  if (isOnboarding) {
    return (
      <div className="h-screen bg-zinc-950 flex overflow-hidden">
        <main className="h-full flex-1 min-w-0 overflow-auto">
          {children}
        </main>
        {alertDialog}
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
          <Sidebar onLogout={handleLogout} />
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-zinc-800" />
        <ResizablePanel defaultSize={85} minSize={30} className="min-w-0">
          <main className="h-full flex-1 min-w-0 overflow-auto">
            {children}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
      {alertDialog}
    </div>
  );
}
