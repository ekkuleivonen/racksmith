import { useMemo, useState } from "react";
import { useNavigate, NavLink, useLocation } from "react-router-dom";
import { GitBranch, KeyRound, Package, RefreshCw, Search, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSetupStore } from "@/stores/setup";
import { useGitStatuses, useHosts } from "@/hooks/queries";
import { useSshStore } from "@/stores/ssh";
import { hostDisplayLabel, isManagedHost, isReachableHost } from "@/lib/hosts";
import { cn } from "@/lib/utils";

function SshHostPicker({ onSelect }: { onSelect: (hostId: string, label: string) => void }) {
  const { data: hosts = [] } = useHosts();
  const [search, setSearch] = useState("");

  const reachable = useMemo(
    () => hosts.filter((h) => isManagedHost(h) && isReachableHost(h)),
    [hosts],
  );

  const filtered = search
    ? reachable.filter((h) =>
        hostDisplayLabel(h).toLowerCase().includes(search.toLowerCase()),
      )
    : reachable;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-zinc-500" />
        <Input
          className="h-7 text-xs pl-7"
          placeholder="Search hosts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {filtered.length === 0 && (
          <p className="text-[10px] text-zinc-500 px-2 py-3 text-center">
            No reachable hosts
          </p>
        )}
        {filtered.map((h) => (
          <button
            key={h.id}
            type="button"
            className="w-full text-left px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors truncate"
            onClick={() => onSelect(h.id, hostDisplayLabel(h))}
          >
            {hostDisplayLabel(h)}
            {h.ip_address && (
              <span className="text-zinc-500 ml-1.5">{h.ip_address}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SidebarFooter() {
  const navigate = useNavigate();
  const pathname = useLocation().pathname;

  const status = useSetupStore((s) => s.status);
  const openPublicKey = useSetupStore((s) => s.openPublicKey);
  const syncRepo = useSetupStore((s) => s.syncRepo);
  const syncing = useSetupStore((s) => s.syncing);
  const { data: gitData } = useGitStatuses();

  const sshTabs = useSshStore((s) => s.tabs);
  const sshPanelOpen = useSshStore((s) => s.panelOpen);
  const openSession = useSshStore((s) => s.openSession);
  const togglePanel = useSshStore((s) => s.togglePanel);

  const [hostPickerOpen, setHostPickerOpen] = useState(false);

  const modifiedPaths = gitData?.modifiedPaths ?? {};
  const untrackedPaths = gitData?.untrackedPaths ?? {};
  const changeCount =
    Object.keys(modifiedPaths).length + Object.keys(untrackedPaths).length;

  const isRegistryActive = pathname.startsWith("/registry");

  const handleSshClick = () => {
    if (sshTabs.length > 0) {
      togglePanel();
    } else {
      setHostPickerOpen(true);
    }
  };

  const handleHostSelect = (hostId: string, label: string) => {
    setHostPickerOpen(false);
    openSession(hostId, label);
  };

  return (
    <div className="mt-auto">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                "size-7 shrink-0 hover:border-amber-700/50 hover:text-amber-200/80",
                isRegistryActive
                  ? "border-amber-600/60 text-amber-200 bg-amber-500/10"
                  : "text-zinc-400",
              )}
              asChild
            >
              <NavLink to="/registry" aria-label="Registry">
                <Package className="size-3" />
              </NavLink>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Registry
          </TooltipContent>
        </Tooltip>
        <div className="flex-1" />
        <Popover open={hostPickerOpen} onOpenChange={setHostPickerOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    "size-7 shrink-0",
                    sshPanelOpen && sshTabs.length > 0 && "border-zinc-600 text-zinc-100",
                  )}
                  onClick={handleSshClick}
                  aria-label="SSH Terminal"
                >
                  <Terminal className="size-3" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              SSH Terminal
            </TooltipContent>
          </Tooltip>
          <PopoverContent side="top" align="start" className="w-56 p-2">
            <SshHostPicker onSelect={handleHostSelect} />
          </PopoverContent>
        </Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="size-7 shrink-0"
              disabled={!status?.repo_ready || syncing}
              onClick={() => void syncRepo()}
              aria-label="Sync repo"
            >
              <RefreshCw className={`size-3 ${syncing ? "animate-spin" : ""}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Rebase racksmith branch on main
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative shrink-0 overflow-visible">
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                disabled={changeCount === 0}
                onClick={() => navigate("/diff/review")}
                aria-label="Review changes"
              >
                <GitBranch className="size-3" />
              </Button>
              {changeCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[12px] h-3 px-0.5 flex items-center justify-center rounded-full bg-yellow-500 text-[9px] font-medium text-zinc-900 pointer-events-none">
                  {changeCount > 99 ? "99+" : changeCount}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Review changes
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => void openPublicKey()}
              aria-label="Show Racksmith public key"
            >
              <KeyRound className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Racksmith public key
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
