import { useLocation, NavLink } from "react-router-dom";
import { Plus, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHosts } from "@/hooks/queries";
import { usePingStore } from "@/stores/ping";
import { hostStatusKey } from "@/lib/ssh";
import { isManagedHost } from "@/lib/hosts";

export function SidebarHostsSection() {
  const location = useLocation();
  const pathname = location.pathname;
  const { data: allHosts = [] } = useHosts();
  const hosts = allHosts.filter((h) => isManagedHost(h) && !h.placement?.rack);
  const pingStatuses = usePingStore((s) => s.statuses);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border border-transparent">
        <NavLink
          to="/hosts"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
              isActive || pathname.startsWith("/hosts")
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
          <Server className="size-3 shrink-0" />
          Unassigned Hosts
        </NavLink>
        <NavLink
          to="/hosts/create"
          className="text-zinc-500 hover:text-zinc-100"
          aria-label="Add host"
        >
          <Plus className="size-3" />
        </NavLink>
      </div>
      <div className="space-y-0.5 pl-2">
        {hosts.length === 0 ? (
          <p className="px-2 py-0.5 text-[10px] text-zinc-500">
            No unassigned hosts
          </p>
        ) : (
          <div className="space-y-0.5">
            {hosts.map((host) => {
              const hostStatus =
                pingStatuses[hostStatusKey(host.id)] ?? "unknown";
              return (
                <NavLink
                  key={host.id}
                  to={`/hosts/${host.id}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-1.5 rounded py-0.5 px-1.5 text-xs no-underline",
                      isActive
                        ? "bg-zinc-700 text-zinc-100"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300",
                    )
                  }
                >
                  <span
                    className={cn(
                      "size-1 shrink-0 rounded-full",
                      hostStatus === "online" && "bg-emerald-400",
                      hostStatus === "offline" && "bg-red-500",
                      hostStatus === "unknown" && "bg-zinc-700",
                    )}
                    title={
                      hostStatus === "online"
                        ? "Online"
                        : hostStatus === "offline"
                          ? "Offline"
                          : "Unknown"
                    }
                  />
                  <span className="truncate">
                    {host.name || host.hostname || host.ip_address || host.id}
                  </span>
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
