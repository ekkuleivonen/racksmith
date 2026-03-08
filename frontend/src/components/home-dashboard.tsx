import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useNodesStore } from "@/stores/nodes";
import { useRackStore } from "@/stores/racks";
import { useGroupsStore } from "@/stores/groups";
import { useStackStore } from "@/stores/stacks";
export function HomeDashboard() {
  const nodes = useNodesStore((s) => s.nodes);
  const rackEntries = useRackStore((s) => s.rackEntries);
  const groups = useGroupsStore((s) => s.groups);
  const stacks = useStackStore((s) => s.stacks);
  const loadNodes = useNodesStore((s) => s.load);
  const loadRacks = useRackStore((s) => s.load);
  const loadGroups = useGroupsStore((s) => s.load);
  const loadStacks = useStackStore((s) => s.load);

  useEffect(() => {
    void Promise.all([
      loadNodes(),
      loadRacks(),
      loadGroups(),
      loadStacks(),
    ]);
  }, [loadNodes, loadRacks, loadGroups, loadStacks]);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-100">Welcome to Racksmith</h1>
          <p className="text-zinc-400 text-sm">
            Your infrastructure is ready. Manage nodes, racks, groups, and stacks from the sidebar.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="border border-zinc-800 bg-zinc-900/40 p-4 rounded">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Nodes</p>
            <p className="text-2xl font-semibold text-zinc-100 mt-1">{nodes.length}</p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <Link to="/nodes">View nodes</Link>
            </Button>
          </div>
          <div className="border border-zinc-800 bg-zinc-900/40 p-4 rounded">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Racks</p>
            <p className="text-2xl font-semibold text-zinc-100 mt-1">{rackEntries.length}</p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <Link to="/racks">View racks</Link>
            </Button>
          </div>
          <div className="border border-zinc-800 bg-zinc-900/40 p-4 rounded">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Groups</p>
            <p className="text-2xl font-semibold text-zinc-100 mt-1">{groups.length}</p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <Link to="/groups">View groups</Link>
            </Button>
          </div>
          <div className="border border-zinc-800 bg-zinc-900/40 p-4 rounded">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Stacks</p>
            <p className="text-2xl font-semibold text-zinc-100 mt-1">{stacks.length}</p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <Link to="/stacks">View stacks</Link>
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button asChild>
            <Link to="/nodes/create">Add node</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/repos">Manage repos</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
