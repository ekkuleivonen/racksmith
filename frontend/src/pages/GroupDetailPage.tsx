import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getGroup } from "@/lib/groups";
import type { GroupWithMembers } from "@/lib/groups";
import { NavLink } from "react-router-dom";

export function GroupDetailPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupWithMembers | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!slug) {
      setGroup(null);
      return;
    }
    try {
      const data = await getGroup(slug);
      setGroup(data.group);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load group");
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <p className="text-zinc-500 text-sm">Loading group...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="space-y-1">
            <h1 className="text-zinc-100 font-semibold">Group not found</h1>
            <p className="text-sm text-zinc-500">This group does not exist.</p>
          </div>
          <Button size="sm" onClick={() => navigate("/groups")}>
            Back to groups
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-zinc-100 font-semibold">{group.name}</h1>
              {group.description ? (
                <p className="text-xs text-zinc-500 mt-0.5">{group.description}</p>
              ) : null}
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/groups")}>
              Back to groups
            </Button>
          </div>
          <Badge variant="outline">{group.nodes.length} node{group.nodes.length === 1 ? "" : "s"}</Badge>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-400">Members</h2>
          {group.nodes.length === 0 ? (
            <div className="border border-zinc-800 bg-zinc-900/30 p-4">
              <p className="text-zinc-500 text-sm">No nodes in this group</p>
            </div>
          ) : (
            <div className="space-y-1">
              {group.nodes.map((node) => (
                <NavLink
                  key={node.id}
                  to={`/nodes/${node.id}`}
                  className="block border border-zinc-800 bg-zinc-900/30 p-3 hover:border-zinc-700 transition-colors"
                >
                  <p className="text-zinc-100 font-medium">
                    {node.name || node.hostname || node.host || node.id}
                  </p>
                  <p className="text-xs text-zinc-500">{node.host}</p>
                </NavLink>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
