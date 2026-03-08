import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layers, Pencil, Plus, Power, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { SshTerminal } from "@/components/ssh/ssh-terminal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  deleteNode,
  getNode,
  isReachableNode,
  refreshNode,
  updateNode,
  type Node,
} from "@/lib/nodes";
import {
  fetchPingStatuses,
  rebootNode as rebootNodeApi,
  type PingStatus,
} from "@/lib/ssh";
import { listStacks, type StackSummary } from "@/lib/stacks";
import { cn } from "@/lib/utils";

export function NodePage() {
  const navigate = useNavigate();
  const { slug: nodeSlug = "" } = useParams();
  const [node, setNode] = useState<Node | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebooting, setRebooting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pingStatus, setPingStatus] = useState<PingStatus>("unknown");
  const [stacks, setStacks] = useState<StackSummary[]>([]);
  const [editingConnection, setEditingConnection] = useState(false);
  const [connectionDraft, setConnectionDraft] = useState({
    host: "",
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

  useEffect(() => {
    if (node) {
      setConnectionDraft({
        host: node.host ?? "",
        ssh_user: node.ssh_user ?? "",
        ssh_port: node.ssh_port ?? 22,
      });
      setLabelsDraft(node.labels ?? []);
      setNameDraft(node.name ?? "");
      if (!node.host || !node.ssh_user) {
        setEditingConnection(true);
      }
    }
  }, [node]);

  const loadNode = useCallback(async () => {
    if (!nodeSlug) {
      setNode(null);
      return;
    }
    const data = await getNode(nodeSlug);
    setNode(data.node);
  }, [nodeSlug]);

  useEffect(() => {
    let active = true;
    void loadNode()
      .catch((error) => {
        if (!active) return;
        toast.error(
          error instanceof Error ? error.message : "Failed to load node",
        );
        setNode(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadNode]);

  useEffect(() => {
    if (!nodeSlug) return;
    listStacks()
      .then((data) => setStacks(data.stacks))
      .catch(() => setStacks([]));
  }, [nodeSlug]);

  useEffect(() => {
    if (!nodeSlug || !node?.host) {
      setPingStatus("unknown");
      return;
    }

    let active = true;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const response = await fetchPingStatuses([{ node_slug: nodeSlug }]);
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
  }, [nodeSlug, node?.host]);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <p className="text-zinc-500 text-sm">Loading node...</p>
      </div>
    );
  }

  if (!node || !node.managed) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="space-y-1">
            <h1 className="text-zinc-100 font-semibold">
              Managed node not found
            </h1>
            <p className="text-sm text-zinc-500">
              This node is either missing or marked as visual-only.
            </p>
          </div>
          <Button size="sm" onClick={() => navigate("/rack/create")}>
            Back to racks
          </Button>
        </div>
      </div>
    );
  }

  const rackSlug = node.placement?.rack;

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-zinc-100 font-semibold">
                {node.name || node.host || "Unassigned"}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-zinc-500">
                  {node.placement
                    ? `${node.placement.u_height ?? 1}U at col ${(node.placement.col_start ?? 0) + 1}`
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
              {rackSlug ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate(`/rack/view/${rackSlug}?nodeSlug=${node.slug}`)
                  }
                >
                  View rack
                </Button>
              ) : null}
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={refreshing || !isReachableNode(node)}
                aria-label="Rediscover node"
                title="Rediscover node"
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    await refreshNode(node.slug);
                    await loadNode();
                    toast.success("Node rediscovered");
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Failed to rediscover node",
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
                disabled={rebooting || !isReachableNode(node)}
                onClick={async () => {
                  setRebooting(true);
                  try {
                    await rebootNodeApi(node.slug);
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
                aria-label="Delete node"
                disabled={deleting}
                onClick={async () => {
                  if (!window.confirm("Delete this node? This cannot be undone."))
                    return;
                  setDeleting(true);
                  try {
                    await deleteNode(node.slug);
                    toast.success("Node deleted");
                    navigate(rackSlug ? `/rack/view/${rackSlug}` : "/nodes");
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Failed to delete node",
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

          {((node.os_family ?? (node as { os?: string }).os) ||
            (node.labels ?? []).length > 0) && (
            <div className="flex flex-wrap gap-1">
              {(node as { os?: string }).os || node.os_family ? (
                <Badge variant="outline">
                  {(node as { os?: string }).os ?? node.os_family ?? ""}
                </Badge>
              ) : null}
              {(node.labels ?? []).map((label) => (
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
                    setNameDraft(node.name ?? "");
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
                        await updateNode(node.slug, {
                          name: nameDraft.trim() || "",
                          host: node.host ?? "",
                          ssh_user: node.ssh_user ?? "",
                          ssh_port: node.ssh_port ?? 22,
                          labels: node.labels ?? [],
                          groups: node.groups ?? [],
                        });
                        await loadNode();
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
                      setNameDraft(node.name ?? "");
                      setEditingName(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-300">
                {node.name || "Not set"}
              </p>
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
                  value={connectionDraft.host}
                  onChange={(e) =>
                    setConnectionDraft((d) => ({ ...d, host: e.target.value }))
                  }
                  placeholder="Host or IP"
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
                        await updateNode(node.slug, {
                          name: node.name ?? "",
                          host: connectionDraft.host,
                          ssh_user: connectionDraft.ssh_user,
                          ssh_port: connectionDraft.ssh_port,
                          labels: node.labels ?? [],
                          groups: node.groups ?? [],
                        });
                        await loadNode();
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
                        host: node.host ?? "",
                        ssh_user: node.ssh_user ?? "",
                        ssh_port: node.ssh_port ?? 22,
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
                <p>Host: {node.host || "Not set"}</p>
                <p>User: {node.ssh_user || "Not set"}</p>
                <p>Port: {node.ssh_port}</p>
              </div>
            )}
            <p className="text-xs text-zinc-500">
              OS:{" "}
              {node.os_family ??
                (node as { os?: string }).os ??
                "Not discovered"}
            </p>
            <p className="text-xs text-zinc-500">
              MAC: {node.mac_address || "Not discovered"}
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
                    setLabelsDraft(node.labels ?? []);
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
                        await updateNode(node.slug, {
                          name: node.name ?? "",
                          host: node.host ?? "",
                          ssh_user: node.ssh_user ?? "",
                          ssh_port: node.ssh_port ?? 22,
                          labels: labelsDraft,
                          groups: node.groups ?? [],
                        });
                        await loadNode();
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
                      setLabelsDraft(node.labels ?? []);
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
                {(node.labels ?? []).length > 0 ? (
                  (node.labels ?? []).map((label) => (
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
        </section>

        <section className="space-y-3">
          {isReachableNode(node) ? (
            <SshTerminal
              nodeSlug={node.slug}
              node={node}
              title="SSH"
              description="Open a terminal to this device using the server host machine's SSH credentials."
            />
          ) : (
            <section className="border border-zinc-800 bg-zinc-900/30 p-4">
              <p className="text-zinc-500 text-sm">
                Add host and SSH user above, then Save to enable SSH access.
              </p>
            </section>
          )}
        </section>

        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">
              Available stacks
            </h2>
          </div>
          {stacks.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No stacks defined yet.{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-zinc-300"
                onClick={() => navigate("/stacks/create")}
              >
                Create one
              </button>
            </p>
          ) : (
            <ul className="space-y-2">
              {stacks.map((stack) => (
                <li
                  key={stack.id}
                  className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm text-zinc-200 truncate">
                      {stack.name}
                    </p>
                    {stack.description ? (
                      <p className="text-xs text-zinc-500 truncate">
                        {stack.description}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {stack.roles.slice(0, 4).map((role) => (
                        <Badge
                          key={role}
                          variant="outline"
                          className="text-[10px] border-zinc-700 text-zinc-400"
                        >
                          {role}
                        </Badge>
                      ))}
                      {stack.roles.length > 4 ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] border-zinc-700 text-zinc-400"
                        >
                          +{stack.roles.length - 4} more
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
                        `/stacks/${stack.id}?node=${encodeURIComponent(node.slug)}`,
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

      </div>
    </div>
  );
}
