import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  activateLocalRepo,
  getSetupStatus,
  listLocalRepos,
  type LocalRepo,
  type SetupStatus,
} from "@/lib/setup";
import {
  getRack,
  listRacks,
  type RackItem,
  type RackSummary,
} from "@/lib/racks";
import { listPlaybooks, type PlaybookSummary } from "@/lib/playbooks";
import { fetchPingStatuses, type PingStatus } from "@/lib/ssh";
import { useAuth } from "@/context/auth-context";

type AppShellProps = {
  children: ReactNode;
  title: string;
};

type RackNavEntry = {
  rack: RackSummary;
  items: RackItem[];
};

const MANAGE_REPOS_VALUE = "__manage_repos__";

function itemStatusKey(rackId: string, itemId: string) {
  return `${rackId}:${itemId}`;
}

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
      <aside className="w-60 shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-4">
        <div className="space-y-1">
          <p className="text-sm text-zinc-100 font-semibold tracking-wide">
            RACKSMITH
          </p>
          <p className="text-[10px] text-zinc-500">{status.repo?.full_name}</p>
        </div>

        <nav className="space-y-1 overflow-y-auto">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border border-transparent">
              <NavLink
                to={racksHref}
                className={({ isActive }) =>
                  cn(
                    "text-[11px] uppercase tracking-wide",
                    isActive || location.pathname.startsWith("/rack/")
                      ? "text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200",
                  )
                }
              >
                Racks
              </NavLink>
              <NavLink
                to="/rack/create"
                className="text-zinc-500 hover:text-zinc-100"
                aria-label="Create rack"
              >
                <Plus className="size-3" />
              </NavLink>
            </div>
            <div className="space-y-1 pl-3">
              {rackEntries.length === 0 ? (
                <p className="px-3 py-1 text-[10px] text-zinc-500">
                  No racks yet
                </p>
              ) : (
                rackEntries.map(({ rack, items }) => (
                  <div key={rack.id} className="space-y-1">
                    <NavLink
                      to={`/rack/view/${rack.id}`}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center rounded-none px-3 py-1.5 text-[11px] border border-transparent",
                          isActive
                            ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                            : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900",
                        )
                      }
                    >
                      <span className="truncate">{rack.name}</span>
                    </NavLink>
                    <div className="space-y-1 pl-3">
                      {items.length === 0 ? (
                        <p className="px-3 py-1 text-[10px] text-zinc-600">
                          No hardware yet
                        </p>
                      ) : (
                        items.map((item) => {
                          const itemStatus =
                            pingStatuses[itemStatusKey(rack.id, item.id)] ??
                            "unknown";
                          return (
                            <NavLink
                              key={item.id}
                              to={`/rack/${rack.id}/item/${item.id}`}
                              className={({ isActive }) =>
                                cn(
                                  "flex items-center gap-2 rounded-none px-3 py-1 text-[10px] border border-transparent",
                                  isActive
                                    ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900",
                                )
                              }
                            >
                              <span
                                className={cn(
                                  "size-1 shrink-0 rounded-full",
                                  itemStatus === "online" && "bg-emerald-400",
                                  itemStatus === "offline" && "bg-red-500",
                                  itemStatus === "unknown" && "bg-zinc-700",
                                )}
                                title={
                                  itemStatus === "online"
                                    ? "Online"
                                    : itemStatus === "offline"
                                      ? "Offline"
                                      : "Unknown"
                                }
                              />
                              <span className="truncate">
                                {item.name || item.host || item.id}
                              </span>
                            </NavLink>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border border-transparent">
              <NavLink
                to={playbooksHref}
                className={({ isActive }) =>
                  cn(
                    "text-[11px] uppercase tracking-wide",
                    isActive || location.pathname.startsWith("/playbooks")
                      ? "text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200",
                  )
                }
              >
                Playbooks
              </NavLink>
              <NavLink
                to="/playbooks/create"
                className="text-zinc-500 hover:text-zinc-100"
                aria-label="Create playbook"
              >
                <Plus className="size-3" />
              </NavLink>
            </div>
            <div className="space-y-1 pl-3">
              {playbooks.length === 0 ? (
                <p className="px-3 py-1 text-[10px] text-zinc-500">
                  No playbooks yet
                </p>
              ) : (
                playbooks.map((playbook) => (
                  <NavLink
                    key={playbook.id}
                    to={`/playbooks/${playbook.id}`}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center rounded-none px-3 py-1.5 text-[11px] border border-transparent",
                        isActive
                          ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                          : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900",
                      )
                    }
                  >
                    <span className="truncate">{playbook.play_name}</span>
                  </NavLink>
                ))
              )}
            </div>
          </div>

          <NavLink
            to="/code"
            className={({ isActive }) =>
              cn(
                "flex items-center rounded-none px-3 py-1.5 text-[11px] uppercase tracking-wide border border-transparent",
                isActive
                  ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900",
              )
            }
          >
            Code
          </NavLink>
        </nav>

        <div className="mt-auto space-y-3">
         
          <div className="flex items-center gap-2">
            <Select
              disabled={switchingRepo}
              value={
                status?.repo ? `${status.repo.owner}/${status.repo.repo}` : ""
              }
              onValueChange={async (value) => {
                if (!value || switchingRepo) return;
                if (value === MANAGE_REPOS_VALUE) {
                  navigate("/?manageRepos=1");
                  return;
                }

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
                  setLocalRepos(nextLocalRepos);
                  navigate(
                    nextStatus.rack_ready && nextRackEntries[0]
                      ? `/rack/view/${nextRackEntries[0].rack.id}`
                      : "/rack/create",
                    { replace: true },
                  );
                  toast.success(`Switched to ${owner}/${repo}`);
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Failed to switch repo",
                  );
                } finally {
                  setSwitchingRepo(false);
                }
              }}
            >
              <SelectTrigger className="min-w-0 flex-1 text-[10px]" size="sm">
                <SelectValue placeholder="Select repo" />
              </SelectTrigger>
              <SelectContent>
                {localRepos.map((repo) => (
                  <SelectItem
                    key={repo.full_name}
                    value={`${repo.owner}/${repo.repo}`}
                  >
                    {repo.full_name}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={MANAGE_REPOS_VALUE}>Create or manage repos</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className={
                "shrink-0 h-7 px-2 text-[10px]"
              }
              onClick={logout}
            >
              Logout
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
