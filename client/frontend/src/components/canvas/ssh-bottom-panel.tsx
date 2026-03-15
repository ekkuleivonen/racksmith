import { useMemo, useState } from "react";
import { Minus, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SshTerminal } from "@/components/ssh/ssh-terminal";
import { useHost, useHosts } from "@/hooks/queries";
import { hostDisplayLabel, isManagedHost, isReachableHost, type Host } from "@/lib/hosts";
import { useSshStore, type SshTab } from "@/stores/ssh";
import { cn } from "@/lib/utils";

function TabTerminal({ tab, active }: { tab: SshTab; active: boolean }) {
  const { data: host } = useHost(tab.hostId);

  if (!host || !isReachableHost(host)) {
    return (
      <div className={cn("h-full", active ? "block" : "hidden")}>
        <div className="h-full flex items-center justify-center bg-zinc-950">
          <p className="text-xs text-zinc-500">Host not reachable for SSH.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-full", active ? "block" : "hidden")}>
      <SshTerminal hostId={tab.hostId} host={host} autoConnect visible={active} />
    </div>
  );
}

function AddTabHostPicker({ onSelect }: { onSelect: (hostId: string, label: string) => void }) {
  const { data: hosts = [] } = useHosts();
  const [search, setSearch] = useState("");

  const reachable = useMemo(
    () => hosts.filter((h) => isManagedHost(h) && isReachableHost(h)),
    [hosts],
  );

  const filtered = search
    ? reachable.filter((h: Host) =>
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
        {filtered.map((h: Host) => (
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

export function SshBottomPanel() {
  const tabs = useSshStore((s) => s.tabs);
  const activeTabId = useSshStore((s) => s.activeTabId);
  const setActiveTab = useSshStore((s) => s.setActiveTab);
  const closeTab = useSshStore((s) => s.closeTab);
  const openSession = useSshStore((s) => s.openSession);
  const closePanel = useSshStore((s) => s.closePanel);
  const closeAllSessions = useSshStore((s) => s.closeAllSessions);

  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="h-full flex flex-col bg-[#09090b] shadow-[0_-6px_16px_rgba(0,0,0,0.5)]">
      <div className="flex items-center border-b border-zinc-800/60 shrink-0">
        <div className="flex-1 flex items-center min-w-0 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "group flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium tracking-wide border-r border-zinc-800/60 shrink-0 transition-colors",
                tab.id === activeTabId
                  ? "bg-zinc-900 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50",
              )}
            >
              <span className="truncate max-w-[120px]">{tab.label}</span>
              <span
                role="button"
                tabIndex={0}
                className="size-3.5 flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }
                }}
              >
                <X className="size-2.5" />
              </span>
            </button>
          ))}
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center px-2 py-1.5 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                aria-label="New SSH session"
              >
                <Plus className="size-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-56 p-2">
              <AddTabHostPicker
                onSelect={(hostId, label) => {
                  setAddOpen(false);
                  openSession(hostId, label);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-zinc-500 hover:text-zinc-300 shrink-0"
          aria-label="Minimize SSH panel"
          onClick={closePanel}
        >
          <Minus className="size-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-zinc-500 hover:text-zinc-300 mr-1 shrink-0"
          aria-label="Close all SSH sessions"
          onClick={closeAllSessions}
        >
          <X className="size-3" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 px-1 pb-1">
        {tabs.map((tab) => (
          <TabTerminal key={tab.id} tab={tab} active={tab.id === activeTabId} />
        ))}
      </div>
    </div>
  );
}
