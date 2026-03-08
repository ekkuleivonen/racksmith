import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteGroup, getGroup } from "@/lib/groups";
import type { GroupWithMembers } from "@/lib/groups";
import {
  getNode,
  listNodes,
  nodeDisplayLabel,
  updateNode,
} from "@/lib/nodes";
import type { Node } from "@/lib/nodes";
import { NavLink } from "react-router-dom";

export function GroupDetailPage() {
  const { groupId = "" } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupWithMembers | null>(null);
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [addingNode, setAddingNode] = useState(false);
  const [removingNodeId, setRemovingNodeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!groupId) {
      setGroup(null);
      return;
    }
    try {
      const data = await getGroup(groupId);
      setGroup(data.group);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load group");
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listNodes().then(setAllNodes).catch(() => setAllNodes([]));
  }, []);

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
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate("/groups")}>
                Back to groups
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={deleting}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={async () => {
                  if (!window.confirm("Delete this group? Nodes will no longer be assigned to it."))
                    return;
                  setDeleting(true);
                  try {
                    await deleteGroup(group.id);
                    toast.success("Group deleted");
                    navigate("/groups", { replace: true });
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Failed to delete group");
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                Delete group
              </Button>
            </div>
          </div>
          <Badge variant="outline">{group.nodes.length} node{group.nodes.length === 1 ? "" : "s"}</Badge>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-400">Members</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">Add node:</span>
            <Select
              value=""
              onValueChange={async (nodeId) => {
                if (!nodeId) return;
                setAddingNode(true);
                try {
                  const { node } = await getNode(nodeId);
                  await updateNode(nodeId, {
                    name: node.name ?? "",
                    ip_address: node.ip_address ?? "",
                    ssh_user: node.ssh_user ?? "",
                    ssh_port: node.ssh_port ?? 22,
                    managed: node.managed ?? true,
                    labels: node.labels ?? [],
                    groups: [...(node.groups ?? []), groupId],
                    os_family: node.os_family ?? null,
                    notes: node.notes ?? "",
                    placement: node.placement ?? null,
                  });
                  await load();
                  toast.success("Node added to group");
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Failed to add node to group",
                  );
                } finally {
                  setAddingNode(false);
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-8 w-[200px]"
                disabled={addingNode}
              >
                <SelectValue placeholder="Add node" />
              </SelectTrigger>
              <SelectContent>
                {allNodes
                  .filter((n) => !group.nodes.some((m) => m.id === n.id))
                  .map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {nodeDisplayLabel(n)}
                    </SelectItem>
                  ))}
                {allNodes.filter((n) => !group.nodes.some((m) => m.id === n.id))
                  .length === 0 ? (
                  <div className="px-2 py-4 text-xs text-zinc-500">
                    All nodes are already in this group
                  </div>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          {group.nodes.length === 0 ? (
            <div className="border border-zinc-800 bg-zinc-900/30 p-4">
              <p className="text-zinc-500 text-sm">No nodes in this group</p>
            </div>
          ) : (
            <div className="space-y-1">
              {group.nodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center gap-2 border border-zinc-800 bg-zinc-900/30 p-3 hover:border-zinc-700 transition-colors"
                >
                  <NavLink
                    to={`/nodes/${node.id}`}
                    className="flex-1 min-w-0"
                  >
                    <p className="text-zinc-100 font-medium">
                      {node.name || node.hostname || node.ip_address || node.id}
                    </p>
                    <p className="text-xs text-zinc-500">{node.ip_address}</p>
                  </NavLink>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                    disabled={removingNodeId === node.id}
                    aria-label="Remove from group"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRemovingNodeId(node.id);
                      try {
                        const { node: fullNode } = await getNode(node.id);
                        await updateNode(node.id, {
                          name: fullNode.name ?? "",
                          ip_address: fullNode.ip_address ?? "",
                          ssh_user: fullNode.ssh_user ?? "",
                          ssh_port: fullNode.ssh_port ?? 22,
                          managed: fullNode.managed ?? true,
                          labels: fullNode.labels ?? [],
                          groups: (fullNode.groups ?? []).filter(
                            (g) => g !== groupId,
                          ),
                          os_family: fullNode.os_family ?? null,
                          notes: fullNode.notes ?? "",
                          placement: fullNode.placement ?? null,
                        });
                        await load();
                        toast.success("Node removed from group");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Failed to remove node from group",
                        );
                      } finally {
                        setRemovingNodeId(null);
                      }
                    }}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
