import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
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
import {
  activateLocalRepo,
  getSetupStatus,
  listLocalRepos,
  type LocalRepo,
  type SetupStatus,
} from "@/lib/setup";
import { getRack, listRacks } from "@/lib/racks";
import { listPlaybooks, type PlaybookSummary } from "@/lib/playbooks";
import { fetchMachinePublicKey, fetchPingStatuses, type PingStatus } from "@/lib/ssh";
import { useAuth } from "@/context/auth-context";
import { itemStatusKey, type RackNavEntry } from "@/components/sidebar/types";

type AppShellProps = {
  children: ReactNode;
  title: string;
};

async function loadSidebarData() {
  const [nextStatus, nextRacks, nextLocalRepos, nextPlaybooksResult] = await Promise.all([
    getSetupStatus(),
    listRacks().catch(() => []),
    listLocalRepos().catch(() => []),
    listPlaybooks().catch(() => ({ playbooks: [], role_templates: [] })),
  ]);

  const nextRackEntries = await Promise.all(
    nextRacks.map(async (rack) => {
      const detail = await getRack(rack.id);
      return { rack, items: detail.items.filter((item) => item.managed) };
    }),
  );

  return {
    nextStatus,
    nextRackEntries,
    nextLocalRepos,
    nextPlaybooks: nextPlaybooksResult.playbooks,
  };
}

export function AppShell({ children }: AppShellProps) {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [rackEntries, setRackEntries] = useState<RackNavEntry[]>([]);
  const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);
  const [localRepos, setLocalRepos] = useState<LocalRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingRepo, setSwitchingRepo] = useState(false);
  const [publicKeyOpen, setPublicKeyOpen] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [loadingPublicKey, setLoadingPublicKey] = useState(false);
  const [pingStatuses, setPingStatuses] = useState<Record<string, PingStatus>>(
    {},
  );

  const racksHref = useMemo(
    () =>
      rackEntries[0] ? `/rack/view/${rackEntries[0].rack.id}` : "/rack/create",
    [rackEntries],
  );
  const playbooksHref = useMemo(() => "/playbooks", []);

  const pingTargets = useMemo(
    () =>
      rackEntries.flatMap(({ rack, items }) =>
        items.map((item) => ({
          rack_id: rack.id,
          item_id: item.id,
        })),
      ),
    [rackEntries],
  );

  const refreshSidebar = useCallback(async () => {
    const { nextStatus, nextRackEntries, nextLocalRepos, nextPlaybooks } =
      await loadSidebarData();
    setStatus(nextStatus);
    setRackEntries(nextRackEntries);
    setPlaybooks(nextPlaybooks);
    setLocalRepos(nextLocalRepos);
  }, []);

  useEffect(() => {
    let active = true;
    void loadSidebarData()
      .then(({ nextStatus, nextRackEntries, nextLocalRepos, nextPlaybooks }) => {
        if (!active) return;
        setStatus(nextStatus);
        setRackEntries(nextRackEntries);
        setPlaybooks(nextPlaybooks);
        setLocalRepos(nextLocalRepos);
      })
      .catch(() => {
        if (!active) return;
        setStatus(null);
        setRackEntries([]);
        setPlaybooks([]);
        setLocalRepos([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    const handleRefresh = () => {
      void refreshSidebar();
    };
    window.addEventListener("racksmith:sidebar-refresh", handleRefresh);
    return () => {
      window.removeEventListener("racksmith:sidebar-refresh", handleRefresh);
    };
  }, [refreshSidebar]);

  useEffect(() => {
    if (!status?.repo_ready || pingTargets.length === 0) {
      setPingStatuses({});
      return;
    }

    let active = true;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const response = await fetchPingStatuses(pingTargets);
        if (!active) return;
        setPingStatuses(
          Object.fromEntries(
            response.statuses.map((entry) => [
              itemStatusKey(entry.rack_id, entry.item_id),
              entry.status,
            ]),
          ),
        );
      } catch {
        if (!active) return;
      } finally {
        if (active) {
          timer = window.setTimeout(() => {
            void poll();
          }, 10000);
        }
      }
    };

    void poll();

    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [pingTargets, status?.repo_ready, status?.repo?.full_name]);

  const openPublicKeyDialog = useCallback(async () => {
    setPublicKeyOpen(true);
    if (publicKey || loadingPublicKey) {
      return;
    }
    setLoadingPublicKey(true);
    try {
      const result = await fetchMachinePublicKey();
      setPublicKey(result.public_key);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load public key",
      );
    } finally {
      setLoadingPublicKey(false);
    }
  }, [loadingPublicKey, publicKey]);

  const copyPublicKey = useCallback(async () => {
    if (!publicKey) {
      return;
    }
    try {
      await navigator.clipboard.writeText(publicKey);
      toast.success("Public key copied");
    } catch {
      toast.error("Failed to copy public key");
    }
  }, [publicKey]);

  const handleRepoChange = useCallback(
    async (value: string) => {
      const [owner, repo] = value.split("/", 2);
      if (!owner || !repo) return;
      setSwitchingRepo(true);
      try {
        await activateLocalRepo(owner, repo);
        const { nextStatus, nextRackEntries, nextLocalRepos, nextPlaybooks } =
          await loadSidebarData();
        setStatus(nextStatus);
        setRackEntries(nextRackEntries);
        setPlaybooks(nextPlaybooks);
        navigate(
          nextStatus.rack_ready && nextRackEntries[0]
            ? `/rack/view/${nextRackEntries[0].rack.id}`
            : "/rack/create",
          { replace: true },
        );
        toast.success(`Switched to ${owner}/${repo}`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to switch repo",
        );
      } finally {
        setSwitchingRepo(false);
      }
    },
    [navigate],
  );

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
          <Sidebar
            status={status}
            rackEntries={rackEntries}
            playbooks={playbooks}
            localRepos={localRepos}
            pingStatuses={pingStatuses}
            racksHref={racksHref}
            playbooksHref={playbooksHref}
            pathname={location.pathname}
            switchingRepo={switchingRepo}
            onRepoChange={handleRepoChange}
            onOpenPublicKey={openPublicKeyDialog}
            onLogout={logout}
          />
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-zinc-800" />
        <ResizablePanel defaultSize={85} minSize={30} className="min-w-0">
          <main className="h-full flex-1 min-w-0 overflow-hidden">
            {children}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>

      <AlertDialog open={publicKeyOpen} onOpenChange={setPublicKeyOpen}>
        <AlertDialogContent size="md">
          <AlertDialogHeader className="items-start text-left">
            <AlertDialogTitle>Racksmith public key</AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              Add this key to the target host&apos;s `authorized_keys` so Racksmith can SSH in without a password.
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
