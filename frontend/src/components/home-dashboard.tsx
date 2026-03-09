import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useHosts, useRackEntries, useGroups, usePlaybooks } from "@/hooks/queries";
import { isManagedHost } from "@/lib/hosts";

export function HomeDashboard() {
  const { data: hosts = [] } = useHosts();
  const { data: rackEntries = [] } = useRackEntries();
  const { data: groups = [] } = useGroups();
  const { data: playbooks = [] } = usePlaybooks();

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-100">Welcome to Racksmith</h1>
          <p className="text-zinc-400 text-sm">
            Your infrastructure is ready. Manage hosts, racks, groups, and playbooks from the sidebar.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="border border-zinc-800 bg-zinc-900/40 p-4 rounded">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Hosts</p>
            <p className="text-2xl font-semibold text-zinc-100 mt-1">{hosts.filter(isManagedHost).length}</p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <Link to="/hosts">View hosts</Link>
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
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Playbooks</p>
            <p className="text-2xl font-semibold text-zinc-100 mt-1">{playbooks.length}</p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <Link to="/playbooks">View playbooks</Link>
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button asChild>
            <Link to="/hosts/create">Add host</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/repos">Manage repos</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
