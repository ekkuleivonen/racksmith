import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Layers,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SshTerminal } from "@/components/ssh/ssh-terminal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  deleteHost,
  getHost,
  isReachableHost,
  refreshHost,
  updateHost,
  type Host,
} from "@/lib/hosts";
import {
  fetchPingStatuses,
  rebootHost as rebootHostApi,
  type PingStatus,
} from "@/lib/ssh";
import { listGroups, type Group } from "@/lib/groups";
import { listPlaybooks, type PlaybookSummary } from "@/lib/playbooks";
import { cn } from "@/lib/utils";

export function HostPage() {
  const navigate = useNavigate();
  const { id: hostId = "" } = useParams();
  const [host, setHost] = useState<Host | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebooting, setRebooting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pingStatus, setPingStatus] = useState<PingStatus>("unknown");
  const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);
  const [editingConnection, setEditingConnection] = useState(false);
  const [connectionDraft, setConnectionDraft] = useState({
    ip_address: "",
    ssh_user: "",
    ssh_port: 22,
  });
  const [savingConnection, setSavingConnection] = useState(false);
  const [editingLabels, setEditingLabels] = useState(false);
  const [labelsDraft, setLabelsDraft] = useState<string[]>([]);
  const [newLabelInput, setNewLabelInput] = useState("");
  const [savingLabels, setSavingLabels] = useState(false);
  const newLabelInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [editingGroups, setEditingGroups] = useState(false);
  const [groupsDraft, setGroupsDraft] = useState<string[]>([]);
  const [savingGroups, setSavingGroups] = useState(false);
  const [allGroups, setAllGroups] = useState<Group[]>([]);

  useEffect(() => {
    if (host) {
      setConnectionDraft({
        ip_address: host.ip_address ?? "",
        ssh_user: host.ssh_user ?? "",
        ssh_port: host.ssh_port ?? 22,
      });
      setLabelsDraft(host.labels ?? []);
      setNameDraft(host.name ?? "");
      setGroupsDraft(host.groups ?? []);
      if (!host.ip_address || !host.ssh_user) {
        setEditingConnection(true);
      }
    }
  }, [host]);

  const loadHost = useCallback(async () => {
    if (!hostId) {
      setHost(null);
      return;
    }
    const data = await getHost(hostId);
    setHost(data.host);
  }, [hostId]);

  useEffect(() => {
    let active = true;
    void loadHost()
      .catch((error) => {
        if (!active) return;
        toast.error(
          error instanceof Error ? error.message : "Failed to load host",
        );
        setHost(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadHost]);

  useEffect(() => {
    if (!hostId) return;
    listPlaybooks()
      .then((data) => setPlaybooks(data.playbooks))
      .catch(() => setPlaybooks([]));
  }, [hostId]);

  useEffect(() => {
    listGroups()
      .then(setAllGroups)
      .catch(() => setAllGroups([]));
  }, []);

  useEffect(() => {
    if (!hostId || !host?.ip_address) {
      setPingStatus("unknown");
      return;
    }

    let active = true;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const response = await fetchPingStatuses([{ host_id: hostId }]);
        if (!active) return;
        setPingStatus(response.statuses[0]?.status ?? "unknown");
      } catch {
        if (!active) return;
      } finally {
        if (active) {
          timer = window.setTimeout(() => {
            void poll();
          }, 10000);
        }
      }
    };

    void poll();

    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [hostId, host?.ip_address]);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <p className="text-zinc-500 text-sm">Loading host...</p>
      </div>
    );
  }

  if (!host || !host.managed) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="space-y-1">
            <h1 className="text-zinc-100 font-semibold">
              Managed host not found
            </h1>
            <p className="text-sm text-zinc-500">
              This host is either missing or marked as visual-only.
            </p>
          </div>
          <Button size="sm" onClick={() => navigate("/racks/create")}>
            Back to racks
          </Button>
        </div>
      </div>
    );
  }

  const rackId = host.placement?.rack;

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-zinc-100 font-semibold">
                {host.name || host.hostname || host.ip_address || "Unassigned"}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-zinc-500">
                  {host.placement
                    ? `${host.placement.u_height ?? 1}U at col ${(host.placement.col_start ?? 0) + 1}`
                    : "Unassigned"}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1.5 border-zinc-700 text-[10px]",
                    pingStatus === "online" &&
                      "border-emerald-500/40 text-emerald-300",
                    pingStatus === "offline" &&
                      "border-red-500/40 text-red-300",
                    pingStatus === "unknown" && "border-zinc-700 text-zinc-400",
                  )}
                >
                  <span className="relative size-2 shrink-0">
                    {pingStatus === "online" ? (
                      <span className="absolute inset-0 rounded-full bg-emerald-400/70 animate-ping" />
                    ) : null}
                    <span
                      className={cn(
                        "absolute inset-[2px] rounded-full",
                        pingStatus === "online" && "bg-emerald-400",
                        pingStatus === "offline" && "bg-red-500",
                        pingStatus === "unknown" && "bg-zinc-600",
                      )}
                    />
                  </span>
                  {pingStatus === "online"
                    ? "Online"
                    : pingStatus === "offline"
                      ? "Offline"
                      : "Unknown"}
                </Badge>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {rackId ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate(`/racks/view/${rackId}?hostId=${host.id}`)
                  }
                >
                  View rack
                </Button>
              ) : null}
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={refreshing || !isReachableHost(host)}
                aria-label="Rediscover host"
                title="Rediscover host"
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    await refreshHost(host.id);
                    await loadHost();
                    toast.success("Host rediscovered");
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Failed to rediscover host",
                    );
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                <RefreshCw
                  className={cn("size-3.5", refreshing && "animate-spin")}
                />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                aria-label="Reboot device"
                disabled={rebooting || !isReachableHost(host)}
                onClick={async () => {
                  setRebooting(true);
                  try {
                    await rebootHostApi(host.id);
                    toast.success("Reboot command sent");
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Failed to reboot device",
                    );
                  } finally {
                    setRebooting(false);
                  }
                }}
              >
                <Power className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                aria-label="Delete host"
                disabled={deleting}
                onClick={async () => {
                  if (
                    !window.confirm("Delete this host? This cannot be undone.")
                  )
                    return;
                  setDeleting(true);
                  try {
                    await deleteHost(host.id);
                    toast.success("Host deleted");
                    navigate(rackId ? `/racks/view/${rackId}` : "/hosts");
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Failed to delete host",
                    );
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>

          {((host.os_family ?? (host as { os?: string }).os) ||
            (host.labels ?? []).length > 0) && (
            <div className="flex flex-wrap gap-1">
              {(host as { os?: string }).os || host.os_family ? (
                <Badge variant="outline">
                  {(host as { os?: string }).os ?? host.os_family ?? ""}
                </Badge>
              ) : null}
              {(host.labels ?? []).map((label) => (
                <Badge key={label} variant="outline">
                  {label}
                </Badge>
              ))}
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
                Display name
              </p>
              {!editingName ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-zinc-400 hover:text-zinc-200"
                  onClick={() => {
                    setNameDraft(host.name ?? "");
                    setEditingName(true);
                  }}
                >
                  <Pencil className="size-3" />
                  Edit
                </Button>
              ) : null}
            </div>
            {editingName ? (
              <div className="space-y-2">
                <Input
                  className="h-8 text-xs"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Optional display name"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={savingName}
                    onClick={async () => {
                      setSavingName(true);
                      try {
                        await updateHost(host.id, {
                          name: nameDraft.trim() || "",
                          ip_address: host.ip_address ?? "",
                          ssh_user: host.ssh_user ?? "",
                          ssh_port: host.ssh_port ?? 22,
                          labels: host.labels ?? [],
                          groups: host.groups ?? [],
                        });
                        await loadHost();
                        setEditingName(false);
                        toast.success("Display name updated");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Failed to update display name",
                        );
                      } finally {
                        setSavingName(false);
                      }
                    }}
                  >
                    {savingName ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNameDraft(host.name ?? "");
                      setEditingName(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-300">{host.name || "Not set"}</p>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
                Connection
              </p>
              {!editingConnection ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-zinc-400 hover:text-zinc-200"
                  onClick={() => setEditingConnection(true)}
                >
                  <Pencil className="size-3" />
                  Edit
                </Button>
              ) : null}
            </div>
            {editingConnection ? (
              <div className="space-y-2">
                <Input
                  className="h-8 text-xs"
                  value={connectionDraft.ip_address}
                  onChange={(e) =>
                    setConnectionDraft((d) => ({
                      ...d,
                      ip_address: e.target.value,
                    }))
                  }
                  placeholder="IP address"
                />
                <div className="flex gap-2">
                  <Input
                    className="h-8 text-xs flex-1"
                    value={connectionDraft.ssh_user}
                    onChange={(e) =>
                      setConnectionDraft((d) => ({
                        ...d,
                        ssh_user: e.target.value,
                      }))
                    }
                    placeholder="SSH user"
                  />
                  <Input
                    className="h-8 text-xs w-20"
                    type="number"
                    value={connectionDraft.ssh_port}
                    onChange={(e) =>
                      setConnectionDraft((d) => ({
                        ...d,
                        ssh_port: Number(e.target.value) || 22,
                      }))
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={savingConnection}
                    onClick={async () => {
                      setSavingConnection(true);
                      try {
                        await updateHost(host.id, {
                          name: host.name ?? "",
                          ip_address: connectionDraft.ip_address,
                          ssh_user: connectionDraft.ssh_user,
                          ssh_port: connectionDraft.ssh_port,
                          labels: host.labels ?? [],
                          groups: host.groups ?? [],
                        });
                        await loadHost();
                        setEditingConnection(false);
                        toast.success("Connection updated");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Failed to update connection",
                        );
                      } finally {
                        setSavingConnection(false);
                      }
                    }}
                  >
                    {savingConnection ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setConnectionDraft({
                        ip_address: host.ip_address ?? "",
                        ssh_user: host.ssh_user ?? "",
                        ssh_port: host.ssh_port ?? 22,
                      });
                      setEditingConnection(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-sm text-zinc-300">
                <p>IP address: {host.ip_address || "Not set"}</p>
                <p>User: {host.ssh_user || "Not set"}</p>
                <p>Port: {host.ssh_port}</p>
              </div>
            )}
            <p className="text-xs text-zinc-500">
              OS:{" "}
              {host.os_family ??
                (host as { os?: string }).os ??
                "Not discovered"}
            </p>
            <p className="text-xs text-zinc-500">
              MAC: {host.mac_address || "Not discovered"}
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
                Labels
              </p>
              {!editingLabels ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-zinc-400 hover:text-zinc-200"
                  onClick={() => {
                    setLabelsDraft(host.labels ?? []);
                    setNewLabelInput("");
                    setEditingLabels(true);
                  }}
                >
                  <Pencil className="size-3" />
                  Edit
                </Button>
              ) : null}
            </div>
            {editingLabels ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1 min-h-[24px]">
                  {labelsDraft.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                    >
                      {label}
                      <button
                        type="button"
                        className="text-zinc-500 hover:text-zinc-200"
                        onClick={() =>
                          setLabelsDraft((d) => d.filter((l) => l !== label))
                        }
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  {labelsDraft.length === 0 && (
                    <p className="text-xs text-zinc-600">No labels</p>
                  )}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const val = newLabelInput.trim();
                    if (val && !labelsDraft.includes(val)) {
                      setLabelsDraft((d) => [...d, val]);
                    }
                    setNewLabelInput("");
                    newLabelInputRef.current?.focus();
                  }}
                >
                  <Input
                    ref={newLabelInputRef}
                    className="h-8 text-xs flex-1"
                    value={newLabelInput}
                    onChange={(e) => setNewLabelInput(e.target.value)}
                    placeholder="Add label"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    disabled={!newLabelInput.trim()}
                  >
                    <Plus className="size-3" />
                    Add
                  </Button>
                </form>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={savingLabels}
                    onClick={async () => {
                      setSavingLabels(true);
                      try {
                        await updateHost(host.id, {
                          name: host.name ?? "",
                          ip_address: host.ip_address ?? "",
                          ssh_user: host.ssh_user ?? "",
                          ssh_port: host.ssh_port ?? 22,
                          labels: labelsDraft,
                          groups: host.groups ?? [],
                        });
                        await loadHost();
                        setEditingLabels(false);
                        toast.success("Labels updated");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Failed to update labels",
                        );
                      } finally {
                        setSavingLabels(false);
                      }
                    }}
                  >
                    {savingLabels ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setLabelsDraft(host.labels ?? []);
                      setNewLabelInput("");
                      setEditingLabels(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1 min-h-[24px]">
                {(host.labels ?? []).length > 0 ? (
                  (host.labels ?? []).map((label) => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))
                ) : (
                  <p className="text-xs text-zinc-600">No labels</p>
                )}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
                Groups
              </p>
              {!editingGroups ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-zinc-400 hover:text-zinc-200"
                  onClick={() => {
                    setGroupsDraft(host.groups ?? []);
                    setEditingGroups(true);
                  }}
                >
                  <Pencil className="size-3" />
                  Edit
                </Button>
              ) : null}
            </div>
            {editingGroups ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1 min-h-[24px]">
                  {groupsDraft.map((gid) => {
                    const g = allGroups.find((x) => x.id === gid);
                    return (
                      <span
                        key={gid}
                        className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                      >
                        {g?.name ?? gid}
                        <button
                          type="button"
                          className="text-zinc-500 hover:text-zinc-200"
                          onClick={() =>
                            setGroupsDraft((d) => d.filter((id) => id !== gid))
                          }
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    );
                  })}
                  {groupsDraft.length === 0 && (
                    <p className="text-xs text-zinc-600">No groups</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value && !groupsDraft.includes(value)) {
                        setGroupsDraft((d) => [...d, value]);
                      }
                    }}
                  >
                    <SelectTrigger size="sm" className="h-8 text-xs w-[180px]">
                      <SelectValue placeholder="Add group" />
                    </SelectTrigger>
                    <SelectContent>
                      {allGroups
                        .filter((g) => !groupsDraft.includes(g.id))
                        .map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name || g.id}
                          </SelectItem>
                        ))}
                      {allGroups.filter((g) => !groupsDraft.includes(g.id))
                        .length === 0 ? (
                        <div className="px-2 py-4 text-xs text-zinc-500">
                          No more groups to add
                        </div>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={savingGroups}
                    onClick={async () => {
                      setSavingGroups(true);
                      try {
                        await updateHost(host.id, {
                          name: host.name ?? "",
                          ip_address: host.ip_address ?? "",
                          ssh_user: host.ssh_user ?? "",
                          ssh_port: host.ssh_port ?? 22,
                          labels: host.labels ?? [],
                          groups: groupsDraft,
                        });
                        await loadHost();
                        setEditingGroups(false);
                        toast.success("Groups updated");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Failed to update groups",
                        );
                      } finally {
                        setSavingGroups(false);
                      }
                    }}
                  >
                    {savingGroups ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setGroupsDraft(host.groups ?? []);
                      setEditingGroups(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1 min-h-[24px]">
                {(host.groups ?? []).length > 0 ? (
                  (host.groups ?? []).map((gid) => {
                    const g = allGroups.find((x) => x.id === gid);
                    return (
                      <Badge key={gid} variant="outline">
                        {g?.name ?? gid}
                      </Badge>
                    );
                  })
                ) : (
                  <p className="text-xs text-zinc-600">No groups</p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">
              Available playbooks
            </h2>
          </div>
          {playbooks.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No playbooks defined yet.{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-zinc-300"
                onClick={() => navigate("/playbooks/create")}
              >
                Create one
              </button>
            </p>
          ) : (
            <ul className="space-y-2">
              {playbooks.map((playbook) => (
                <li
                  key={playbook.id}
                  className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm text-zinc-200 truncate">
                      {playbook.name}
                    </p>
                    {playbook.description ? (
                      <p className="text-xs text-zinc-500 truncate">
                        {playbook.description}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {playbook.roles.slice(0, 4).map((role) => (
                        <Badge
                          key={role}
                          variant="outline"
                          className="text-[10px] border-zinc-700 text-zinc-400"
                        >
                          {role}
                        </Badge>
                      ))}
                      {playbook.roles.length > 4 ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] border-zinc-700 text-zinc-400"
                        >
                          +{playbook.roles.length - 4} more
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    onClick={() =>
                      navigate(
                        `/playbooks/${playbook.id}?tab=run&host=${encodeURIComponent(host.id)}`,
                      )
                    }
                  >
                    <Layers className="size-3" />
                    Run
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          {isReachableHost(host) ? (
            <SshTerminal
              hostId={host.id}
              host={host}
              title="SSH"
              description="Open a terminal to this device using the server host machine's SSH credentials."
            />
          ) : (
            <section className="border border-zinc-800 bg-zinc-900/30 p-4">
              <p className="text-zinc-500 text-sm">
                Add IP address and SSH user above, then Save to enable SSH
                access.
              </p>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}
