import { useLocation, NavLink } from "react-router-dom";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNodesStore } from "@/stores/nodes";
import { usePingStore } from "@/stores/ping";
import { nodeStatusKey } from "@/lib/ssh";

export function SidebarNodesSection() {
  const location = useLocation();
  const pathname = location.pathname;
  const allNodes = useNodesStore((s) => s.nodes);
  const nodes = allNodes.filter((n) => !n.placement?.rack);
  const pingStatuses = usePingStore((s) => s.statuses);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border border-transparent">
        <NavLink
          to="/nodes"
          className={({ isActive }) =>
            cn(
              "text-[11px] uppercase tracking-wide",
              isActive || pathname.startsWith("/nodes")
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
          Unassigned Nodes
        </NavLink>
        <NavLink
          to="/nodes/create"
          className="text-zinc-500 hover:text-zinc-100"
          aria-label="Add node"
        >
          <Plus className="size-3" />
        </NavLink>
      </div>
      <div className="space-y-0.5 pl-2">
        {nodes.length === 0 ? (
          <p className="px-2 py-0.5 text-[10px] text-zinc-500">
            No unassigned nodes
          </p>
        ) : (
          <div className="space-y-0.5">
            {nodes.map((node) => {
              const nodeStatus =
                pingStatuses[nodeStatusKey(node.slug)] ?? "unknown";
              return (
                <NavLink
                  key={node.slug}
                  to={`/nodes/${node.slug}`}
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
                      nodeStatus === "online" && "bg-emerald-400",
                      nodeStatus === "offline" && "bg-red-500",
                      nodeStatus === "unknown" && "bg-zinc-700",
                    )}
                    title={
                      nodeStatus === "online"
                        ? "Online"
                        : nodeStatus === "offline"
                          ? "Offline"
                          : "Unknown"
                    }
                  />
                  <span className="truncate">
                    {node.name || node.host || node.slug}
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
