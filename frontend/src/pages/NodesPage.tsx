import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Plus } from "lucide-react";
import { useNodesStore } from "@/stores/nodes";
import { usePingStore } from "@/stores/ping";
import { nodeStatusKey } from "@/lib/ssh";
import { cn } from "@/lib/utils";

export function NodesPage() {
  const nodes = useNodesStore((s) => s.nodes);
  const load = useNodesStore((s) => s.load);
  const pingStatuses = usePingStore((s) => s.statuses);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-zinc-100 font-semibold">Nodes</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Hardware machines managed by Racksmith. Add host details for SSH and Ansible.
              </p>
            </div>
            <NavLink
              to="/nodes/create"
              className="text-zinc-500 hover:text-zinc-100"
              aria-label="Add node"
            >
              <Plus className="size-4" />
            </NavLink>
          </div>
        </section>

        <section className="space-y-2">
          {nodes.length === 0 ? (
            <div className="border border-zinc-800 bg-zinc-900/30 p-6 text-center">
              <p className="text-zinc-500 text-sm">No nodes yet</p>
              <p className="text-xs text-zinc-600 mt-1">
                Add your first node to get started.
              </p>
              <NavLink
                to="/nodes/create"
                className="inline-block mt-3 text-sm text-zinc-400 hover:text-zinc-100"
              >
                Add node
              </NavLink>
            </div>
          ) : (
            <div className="space-y-1">
              {nodes.map((node) => {
                const status = pingStatuses[nodeStatusKey(node.slug)] ?? "unknown";
                return (
                  <NavLink
                    key={node.slug}
                    to={`/nodes/${node.slug}`}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 border border-zinc-800 bg-zinc-900/30 p-4 transition-colors",
                        isActive
                          ? "border-zinc-600 bg-zinc-800/50"
                          : "hover:border-zinc-700 hover:bg-zinc-900/50"
                      )
                    }
                  >
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        status === "online" && "bg-emerald-400",
                        status === "offline" && "bg-red-500",
                        status === "unknown" && "bg-zinc-600"
                      )}
                      title={
                        status === "online"
                          ? "Online"
                          : status === "offline"
                            ? "Offline"
                            : "Unknown"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-100 font-medium truncate">
                        {node.name || node.host || node.slug}
                      </p>
                      {node.host ? (
                        <p className="text-xs text-zinc-500 truncate">
                          {node.host}
                          {node.ssh_user ? ` (${node.ssh_user})` : ""}
                        </p>
                      ) : null}
                    </div>
                  </NavLink>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
