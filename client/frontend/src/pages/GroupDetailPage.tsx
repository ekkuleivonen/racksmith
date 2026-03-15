import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";
import { invalidateResource } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DetailLoading, DetailNotFound } from "@/components/shared/detail-states";
import { PageContainer } from "@/components/shared/page-container";
import { KeyValueEditor } from "@/components/shared/key-value-editor";
import {
  varsToRows,
  rowsToVars,
  type VarRow,
} from "@/components/shared/key-value-editor-utils";
import { useGroup, useHosts } from "@/hooks/queries";
import { deleteGroup, updateGroup } from "@/lib/groups";
import { hostDisplayLabel, isManagedHost, updateHost, getHost } from "@/lib/hosts";

export function GroupDetailPage() {
  const { groupId = "" } = useParams();
  const navigate = useNavigate();
  const { data: group, isLoading: loading } = useGroup(groupId || undefined);
  const { data: allHosts = [] } = useHosts();
  const [deleting, setDeleting] = useState(false);
  const [addingHost, setAddingHost] = useState(false);
  const [removingHostId, setRemovingHostId] = useState<string | null>(null);
  const [expandedHostId, setExpandedHostId] = useState<string | null>(null);

  const [varRows, setVarRows] = useState<VarRow[]>([]);
  const [savingVars, setSavingVars] = useState(false);
  const [varsDirty, setVarsDirty] = useState(false);

  const availableHosts = useMemo(
    () => group ? allHosts.filter((n) => isManagedHost(n) && !group.hosts.some((m) => m.id === n.id)) : [],
    [allHosts, group],
  );

  useEffect(() => {
    if (group) {
      setVarRows(varsToRows(group.vars ?? {}));
      setVarsDirty(false);
    }
  }, [group]);

  const invalidateGroup = () => {
    invalidateResource("groups");
  };

  if (loading) return <DetailLoading message="Loading group..." />;
  if (!group) return <DetailNotFound title="Group not found" description="This group does not exist." backPath="/groups" backLabel="Back to groups" />;

  const handleVarRowsChange = (next: VarRow[]) => {
    setVarRows(next);
    setVarsDirty(true);
  };

  const saveVars = async () => {
    setSavingVars(true);
    try {
      await updateGroup(group.id, { name: group.name, vars: rowsToVars(varRows) });
      toast.success("Variables saved");
      setVarsDirty(false);
      invalidateGroup();
    } catch (error) {
      toastApiError(error, "Failed to save variables");
    } finally {
      setSavingVars(false);
    }
  };

  return (
    <PageContainer>
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
                    toastApiError(error, "Failed to delete group");
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
                    placement: host.placement ?? null,
                  });
                  invalidateGroup();
                  toast.success("Host added to group");
                } catch (error) {
                  toastApiError(error, "Failed to add host to group");
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
                {availableHosts.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {hostDisplayLabel(n)}
                  </SelectItem>
                ))}
                {availableHosts.length === 0 ? (
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
              {group.hosts.map((host) => {
                const expanded = expandedHostId === host.id;
                return (
                  <div
                    key={host.id}
                    className="border border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 transition-colors"
                  >
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full p-3 text-left"
                      onClick={() => setExpandedHostId(expanded ? null : host.id)}
                    >
                      <ChevronDown
                        className={`size-3.5 shrink-0 text-zinc-500 transition-transform ${expanded ? "" : "-rotate-90"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-100 font-medium">
                          {hostDisplayLabel(host)}
                        </p>
                        <p className="text-xs text-zinc-500">{host.ip_address}</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                        disabled={removingHostId === host.id}
                        aria-label="Remove from group"
                        onClick={async (e) => {
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
                              placement: fullHost.placement ?? null,
                            });
                            invalidateGroup();
                            toast.success("Host removed from group");
                          } catch (error) {
                            toastApiError(error, "Failed to remove host from group");
                          } finally {
                            setRemovingHostId(null);
                          }
                        }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </button>
                    {expanded && (
                      <div className="px-3 pb-3 pt-0 ml-5.5 border-t border-zinc-800/50 text-xs text-zinc-400 space-y-1">
                        {host.hostname && (
                          <p>
                            <span className="text-zinc-500">Hostname:</span> {host.hostname}
                          </p>
                        )}
                        <p>
                          <span className="text-zinc-500">Managed:</span>{" "}
                          {host.managed ? "Yes" : "No"}
                        </p>
                        {host.labels.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-zinc-500">Labels:</span>
                            {host.labels.map((l) => (
                              <Badge key={l} variant="outline" className="text-[10px] px-1.5 py-0">
                                {l}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <KeyValueEditor
            rows={varRows}
            onChange={handleVarRowsChange}
            emptyMessage="No variables defined. Variables set here apply to all hosts in this group via Ansible group_vars."
          />
          {varsDirty && (
            <div className="flex justify-end">
              <Button size="sm" onClick={saveVars} disabled={savingVars}>
                {savingVars ? "Saving..." : "Save variables"}
              </Button>
            </div>
          )}
        </section>
    </PageContainer>
  );
}
