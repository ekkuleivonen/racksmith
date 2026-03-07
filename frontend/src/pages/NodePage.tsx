import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Power, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SshTerminal } from "@/components/ssh/ssh-terminal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getNode, isReachableNode, refreshNode, type Node } from "@/lib/nodes";
import {
  fetchPingStatuses,
  rebootNode as rebootNodeApi,
  type PingStatus,
} from "@/lib/ssh";
import { cn } from "@/lib/utils";

export function NodePage() {
  const navigate = useNavigate();
  const { slug: nodeSlug = "" } = useParams();
  const [node, setNode] = useState<Node | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebooting, setRebooting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pingStatus, setPingStatus] = useState<PingStatus>("unknown");

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
            </div>
          </div>

          {((node.os_family ?? (node as { os?: string }).os) ||
            (node.tags ?? []).length > 0) && (
            <div className="flex flex-wrap gap-1">
              {(node as { os?: string }).os || node.os_family ? (
                <Badge variant="outline">
                  {(node as { os?: string }).os ?? node.os_family ?? ""}
                </Badge>
              ) : null}
              {(node.tags ?? []).map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <Separator />

          <div className="space-y-1 text-sm text-zinc-300">
            <p>Host: {node.host || "Not set"}</p>
            <p>User: {node.ssh_user || "Not set"}</p>
            <p>Port: {node.ssh_port}</p>
            <p>
              OS:{" "}
              {node.os_family ??
                (node as { os?: string }).os ??
                "Not discovered"}
            </p>
            <p>MAC: {node.mac_address || "Not discovered"}</p>
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
                This node is missing host or SSH user details. Edit the node
                first from the rack view.
              </p>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}
