import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SshTerminal } from "@/components/ssh/ssh-terminal";
import { useHost, useHosts } from "@/hooks/queries";
import {
  hostDisplayLabel,
  isManagedHost,
  isReachableHost,
  type Host,
} from "@/lib/hosts";
import { cn } from "@/lib/utils";

export function AddTabHostPicker({
  onSelect,
}: {
  onSelect: (hostId: string, label: string) => void;
}) {
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

export function SshTerminalPane({
  hostId,
  visible,
}: {
  hostId: string;
  visible: boolean;
}) {
  const { data: host } = useHost(hostId);

  if (!host || !isReachableHost(host)) {
    return (
      <div className={cn("h-full", visible ? "block" : "hidden")}>
        <div className="h-full flex items-center justify-center bg-zinc-950">
          <p className="text-xs text-zinc-500">Host not reachable for SSH.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-full", visible ? "block" : "hidden")}>
      <SshTerminal hostId={hostId} host={host} autoConnect visible={visible} />
    </div>
  );
}
