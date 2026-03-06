import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Power, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SshTerminal } from "@/components/ssh-terminal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  getRack,
  isReachableRackItem,
  refreshRackItem,
  type RackDetail,
  type RackItem,
} from "@/lib/racks";
import { fetchPingStatuses, rebootRackItem, type PingStatus } from "@/lib/ssh";
import { cn } from "@/lib/utils";

export function RackItemPage() {
  const navigate = useNavigate();
  const { rackId = "", itemId = "" } = useParams();
  const [rack, setRack] = useState<RackDetail | null>(null);
  const [items, setItems] = useState<RackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rebooting, setRebooting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pingStatus, setPingStatus] = useState<PingStatus>("unknown");

  const selectedItem = useMemo(
    () => items.find((item) => item.id === itemId) ?? null,
    [itemId, items]
  );

  const loadRack = useCallback(async () => {
    if (!rackId) {
      setRack(null);
      setItems([]);
      return;
    }
    const data = await getRack(rackId);
    setRack(data.rack);
    setItems(data.items);
  }, [rackId]);

  useEffect(() => {
    let active = true;
    void loadRack()
      .catch((error) => {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Failed to load hardware item");
        setRack(null);
        setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadRack]);

  useEffect(() => {
    if (!rackId || !itemId || !selectedItem || !selectedItem.host) {
      setPingStatus("unknown");
      return;
    }

    let active = true;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const response = await fetchPingStatuses([{ rack_id: rackId, item_id: itemId }]);
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
  }, [itemId, rackId, selectedItem]);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <p className="text-zinc-500 text-sm">Loading hardware item...</p>
      </div>
    );
  }

  if (!rack || !selectedItem || !selectedItem.managed) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="space-y-1">
            <h1 className="text-zinc-100 font-semibold">Managed hardware item not found</h1>
            <p className="text-sm text-zinc-500">
              This rack item is either missing or marked as visual-only.
            </p>
          </div>
          <Button size="sm" onClick={() => navigate(rackId ? `/rack/view/${rackId}` : "/rack/create")}>
            Back to rack
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-zinc-100 font-semibold">
                {selectedItem.name || selectedItem.host || "Unassigned"}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-zinc-500">
                  {selectedItem.placement === "parked"
                    ? `Parked · ${selectedItem.position_u_height}U × ${selectedItem.position_col_count} col${
                        selectedItem.position_col_count > 1 ? "s" : ""
                      }`
                    : `${selectedItem.position_u_height}U at col ${selectedItem.position_col_start + 1}`}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1.5 border-zinc-700 text-[10px]",
                    pingStatus === "online" && "border-emerald-500/40 text-emerald-300",
                    pingStatus === "offline" && "border-red-500/40 text-red-300",
                    pingStatus === "unknown" && "border-zinc-700 text-zinc-400"
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
                        pingStatus === "unknown" && "bg-zinc-600"
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/rack/view/${rack.id}?itemId=${selectedItem.id}`)}
              >
                View rack
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={refreshing || !isReachableRackItem(selectedItem)}
                aria-label="Rediscover item"
                title="Rediscover item"
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    await refreshRackItem(rack.id, selectedItem.id);
                    await loadRack();
                    toast.success("Item rediscovered");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Failed to rediscover item"
                    );
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                aria-label="Reboot device"
                disabled={rebooting || !isReachableRackItem(selectedItem)}
                onClick={async () => {
                  setRebooting(true);
                  try {
                    await rebootRackItem(rack.id, selectedItem.id);
                    toast.success("Reboot command sent");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Failed to reboot device"
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

          {(selectedItem.os || selectedItem.tags.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {selectedItem.os && <Badge variant="outline">{selectedItem.os}</Badge>}
              {selectedItem.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <Separator />

          <div className="space-y-1 text-sm text-zinc-300">
            <p>Host: {selectedItem.host || "Not set"}</p>
            <p>User: {selectedItem.ssh_user || "Not set"}</p>
            <p>Port: {selectedItem.ssh_port}</p>
            <p>OS: {selectedItem.os || "Not discovered"}</p>
            <p>MAC: {selectedItem.mac_address || "Not discovered"}</p>
          </div>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-zinc-100 font-semibold">SSH</h2>
            <p className="text-xs text-zinc-500">
              Open a terminal to this device using the server host machine&apos;s SSH credentials.
            </p>
          </div>
          {isReachableRackItem(selectedItem) ? (
            <SshTerminal rackId={rack.id} item={selectedItem} />
          ) : (
            <section className="border border-zinc-800 bg-zinc-900/30 p-4">
              <p className="text-zinc-500 text-sm">
                This item is missing host or SSH user details. Edit the rack item first.
              </p>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}
