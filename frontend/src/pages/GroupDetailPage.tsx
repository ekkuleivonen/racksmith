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
  getHost,
  listHosts,
  hostDisplayLabel,
  updateHost,
} from "@/lib/hosts";
import type { Host } from "@/lib/hosts";
import { NavLink } from "react-router-dom";

export function GroupDetailPage() {
  const { groupId = "" } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupWithMembers | null>(null);
  const [allHosts, setAllHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [addingHost, setAddingHost] = useState(false);
  const [removingHostId, setRemovingHostId] = useState<string | null>(null);

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
    listHosts().then(setAllHosts).catch(() => setAllHosts([]));
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
                  if (!window.confirm("Delete this group? Hosts will no longer be assigned to it."))
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
          <Badge variant="outline">{group.hosts.length} host{group.hosts.length === 1 ? "" : "s"}</Badge>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-400">Members</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">Add host:</span>
            <Select
              value=""
              onValueChange={async (hostId) => {
                if (!hostId) return;
                setAddingHost(true);
                try {
                  const { host } = await getHost(hostId);
                  await updateHost(hostId, {
                    name: host.name ?? "",
                    ip_address: host.ip_address ?? "",
                    ssh_user: host.ssh_user ?? "",
                    ssh_port: host.ssh_port ?? 22,
                    managed: host.managed ?? true,
                    labels: host.labels ?? [],
                    groups: [...(host.groups ?? []), groupId],
                    os_family: host.os_family ?? null,
                    notes: host.notes ?? "",
                    placement: host.placement ?? null,
                  });
                  await load();
                  toast.success("Host added to group");
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Failed to add host to group",
                  );
                } finally {
                  setAddingHost(false);
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-8 w-[200px]"
                disabled={addingHost}
              >
                <SelectValue placeholder="Add host" />
              </SelectTrigger>
              <SelectContent>
                {allHosts
                  .filter((n) => !group.hosts.some((m) => m.id === n.id))
                  .map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {hostDisplayLabel(n)}
                    </SelectItem>
                  ))}
                {allHosts.filter((n) => !group.hosts.some((m) => m.id === n.id))
                  .length === 0 ? (
                  <div className="px-2 py-4 text-xs text-zinc-500">
                    All hosts are already in this group
                  </div>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          {group.hosts.length === 0 ? (
            <div className="border border-zinc-800 bg-zinc-900/30 p-4">
              <p className="text-zinc-500 text-sm">No hosts in this group</p>
            </div>
          ) : (
            <div className="space-y-1">
              {group.hosts.map((host) => (
                <div
                  key={host.id}
                  className="flex items-center gap-2 border border-zinc-800 bg-zinc-900/30 p-3 hover:border-zinc-700 transition-colors"
                >
                  <NavLink
                    to={`/hosts/${host.id}`}
                    className="flex-1 min-w-0"
                  >
                    <p className="text-zinc-100 font-medium">
                      {host.name || host.hostname || host.ip_address || host.id}
                    </p>
                    <p className="text-xs text-zinc-500">{host.ip_address}</p>
                  </NavLink>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                    disabled={removingHostId === host.id}
                    aria-label="Remove from group"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRemovingHostId(host.id);
                      try {
                        const { host: fullHost } = await getHost(host.id);
                        await updateHost(host.id, {
                          name: fullHost.name ?? "",
                          ip_address: fullHost.ip_address ?? "",
                          ssh_user: fullHost.ssh_user ?? "",
                          ssh_port: fullHost.ssh_port ?? 22,
                          managed: fullHost.managed ?? true,
                          labels: fullHost.labels ?? [],
                          groups: (fullHost.groups ?? []).filter(
                            (g) => g !== groupId,
                          ),
                          os_family: fullHost.os_family ?? null,
                          notes: fullHost.notes ?? "",
                          placement: fullHost.placement ?? null,
                        });
                        await load();
                        toast.success("Host removed from group");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Failed to remove host from group",
                        );
                      } finally {
                        setRemovingHostId(null);
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
