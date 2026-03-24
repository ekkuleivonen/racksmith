import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";
import { DetailLoading, DetailNotFound } from "@/components/shared/detail-states";
import { PageContainer } from "@/components/shared/page-container";
import { RackBuilder } from "@/components/racks/rack-builder";
import type { PendingHost } from "@/components/racks/rack-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { SSH_PORT_FALLBACK } from "@/lib/defaults";
import {
  deleteRack,
  getRackLayout,
  unassignAllHostsFromRack as apiUnassignAllHostsFromRack,
  updateRack,
  type RackLayout,
  type RackLayoutHost,
  type ZoneSelection,
} from "@/lib/racks";
import {
  createHost,
  deleteHost,
  getHost,
  isManagedHost,
  updateHost,
  type HostInput,
} from "@/lib/hosts";
import { useDefaults, useHosts } from "@/hooks/queries";

function makePendingHost(zone: ZoneSelection, defaultSshPort: number): PendingHost {
  const bottomU = zone.startU - zone.heightU + 1;
  return {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    hostname: "",
    name: "",
    ip_address: "",
    managed: false,
    placement: "rack",
    position_u_start: bottomU,
    position_u_height: zone.heightU,
    position_col_start: zone.startCol,
    position_col_count: zone.colCount,
    ssh_user: "",
    ssh_port: defaultSshPort,
    labels: [],
    vars: {},
  };
}

function pendingToHostInput(pending: PendingHost, rackId: string): HostInput {
  return {
    name: pending.name,
    ip_address: "",
    ssh_user: "",
    ssh_port: pending.ssh_port,
    managed: false,
    labels: [],
    placement: {
      rack: rackId,
      u_start: pending.position_u_start,
      u_height: pending.position_u_height,
      col_start: pending.position_col_start,
      col_count: pending.position_col_count,
    },
  };
}

function layoutHostToHostInput(
  host: RackLayoutHost,
  rackId: string,
): HostInput {
  return {
    name: host.name,
    ip_address: host.ip_address,
    ssh_user: host.ssh_user,
    ssh_port: host.ssh_port,
    managed: host.managed,
    groups: host.groups,
    labels: host.labels ?? [],
    os_family: host.os_family ?? null,
    placement:
      host.placement === "rack"
        ? {
            rack: rackId,
            u_start: host.position_u_start,
            u_height: host.position_u_height,
            col_start: host.position_col_start,
            col_count: host.position_col_count,
          }
        : null,
  };
}

export function RackDetailPage() {
  const { rackId: rackIdParam = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const highlightedHostId = new URLSearchParams(location.search).get("hostId");

  const [layout, setLayout] = useState<RackLayout | null>(null);
  const [layoutHosts, setLayoutHosts] = useState<RackLayoutHost[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingHost | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rackNameDraft, setRackNameDraft] = useState("");
  const [rackWidthDraft, setRackWidthDraft] = useState<10 | 19>(19);
  const [rackUnitsDraft, setRackUnitsDraft] = useState(12);
  const [rackColsDraft, setRackColsDraft] = useState(12);
  const [frameControlsVisible, setFrameControlsVisible] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const { data: hostsFromStore = [] } = useHosts();
  const { data: defaults } = useDefaults();
  const defaultSshPort = defaults?.ssh_port ?? SSH_PORT_FALLBACK;

  const rack = layout;

  const unplacedHosts = useMemo(() => {
    if (!rackIdParam) return [];
    return hostsFromStore.filter(
      (h) => isManagedHost(h) && !h.placement,
    );
  }, [hostsFromStore, rackIdParam]);

  const managedItemCount = useMemo(
    () => layoutHosts.filter((item) => item.managed).length,
    [layoutHosts],
  );
  const unmanagedItemCount = layoutHosts.length - managedItemCount;

  const loadRack = useCallback(
    async (preserveId?: string) => {
      if (!rackIdParam) {
        setLayout(null);
        setLayoutHosts([]);
        return;
      }

      const { layout: data } = await getRackLayout(rackIdParam);
      setLayout(data);
      setRackNameDraft(data.name);
      setRackWidthDraft(data.rack_width_inches);
      setRackUnitsDraft(data.rack_units);
      setRackColsDraft(data.rack_cols);
      setLayoutHosts(data.hosts);
      setSelectedItemId((prev) => {
        const idToKeep = preserveId ?? prev;
        if (idToKeep && data.hosts.some((h) => h.id === idToKeep)) return idToKeep;
        if (
          highlightedHostId &&
          data.hosts.some((h) => h.id === highlightedHostId)
        )
          return highlightedHostId;
        return null;
      });
    },
    [highlightedHostId, rackIdParam],
  );

  useEffect(() => {
    let active = true;
    void loadRack()
      .catch((error) => {
        if (!active) return;
        toastApiError(error, "Failed to load rack");
        setLayout(null);
        setLayoutHosts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadRack]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const current = params.get("hostId");
    if (selectedItemId) {
      if (current === selectedItemId) return;
      params.set("hostId", selectedItemId);
    } else {
      if (!current) return;
      params.delete("hostId");
    }
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, selectedItemId]);

  useEffect(() => setPending(null), [rackIdParam]);
  useEffect(() => setFrameControlsVisible(false), [rackIdParam]);
  useEffect(() => setEditingName(false), [rackIdParam]);

  const ensureFrameDraftSaved = useCallback(async () => {
    if (!rack) return false;
    const frameChanged =
      rackWidthDraft !== rack.rack_width_inches ||
      rackUnitsDraft !== rack.rack_units ||
      rackColsDraft !== rack.rack_cols;
    if (!frameChanged) return true;

    try {
      const result = await updateRack(rack.id, {
        rack_width_inches: rackWidthDraft,
        rack_units: rackUnitsDraft,
        rack_cols: rackColsDraft,
      });
      setLayout({ ...layout!, ...result.rack, hosts: layout!.hosts });
      return true;
    } catch (error) {
      toastApiError(error, "Failed to update rack frame");
      return false;
    }
  }, [layout, rack, rackColsDraft, rackUnitsDraft, rackWidthDraft]);

  const unassignAllHostsFromRack = useCallback(async () => {
    if (!rack) return;
    const hostsOnRack = layoutHosts.filter((h) => h.placement === "rack");
    if (hostsOnRack.length === 0) return;
    setSaving(true);
    try {
      const frameSaved = await ensureFrameDraftSaved();
      if (!frameSaved) return;
      await apiUnassignAllHostsFromRack(rackIdParam);
      await loadRack();
      toast.success("Nodes unassigned. You can now change the rack frame.");
    } catch (error) {
      toastApiError(error, "Failed to unassign nodes");
    } finally {
      setSaving(false);
    }
  }, [ensureFrameDraftSaved, layoutHosts, loadRack, rack, rackIdParam]);

  const handlePlaceUnplacedHost = useCallback(
    async (
      hostId: string,
      position: {
        position_u_start: number;
        position_u_height: number;
        position_col_start: number;
        position_col_count: number;
      },
    ) => {
      if (!rack) return;
      try {
        const { host } = await getHost(hostId);
        const optimistic: RackLayoutHost = {
          ...host,
          placement: "rack",
          position_u_start: position.position_u_start,
          position_u_height: position.position_u_height,
          position_col_start: position.position_col_start,
          position_col_count: position.position_col_count,
        };
        setLayoutHosts((prev) => [...prev, optimistic]);

        await updateHost(hostId, {
          name: host.name ?? "",
          ip_address: host.ip_address ?? "",
          ssh_user: host.ssh_user ?? "",
          ssh_port: host.ssh_port ?? defaultSshPort,
          managed: host.managed ?? true,
          groups: host.groups ?? [],
          labels: host.labels ?? [],
          os_family: host.os_family ?? null,
          placement: {
            rack: rackIdParam,
            u_start: position.position_u_start,
            u_height: position.position_u_height,
            col_start: position.position_col_start,
            col_count: position.position_col_count,
          },
        });
        toast.success("Host placed on rack");
      } catch (error) {
        await loadRack();
        toastApiError(error, "Failed to place host");
      }
    },
    [defaultSshPort, loadRack, rack, rackIdParam],
  );

  const handleUnplaceHost = useCallback(
    async (hostId: string) => {
      const existing = layoutHosts.find((h) => h.id === hostId);
      if (!existing || !rack) return;

      setLayoutHosts((prev) => prev.filter((h) => h.id !== hostId));
      if (selectedItemId === hostId) setSelectedItemId(null);

      try {
        const input = layoutHostToHostInput(existing, rackIdParam);
        await updateHost(hostId, { ...input, placement: null });
        toast.success("Host unplaced");
      } catch (error) {
        await loadRack();
        toastApiError(error, "Failed to unplace node");
      }
    },
    [layoutHosts, loadRack, rack, rackIdParam, selectedItemId],
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      if (!rack) return;

      setLayoutHosts((prev) => prev.filter((h) => h.id !== itemId));
      if (selectedItemId === itemId) setSelectedItemId(null);

      try {
        await deleteHost(itemId);
        toast.success("Item removed");
      } catch (error) {
        await loadRack();
        toastApiError(error, "Failed to remove item");
      }
    },
    [loadRack, rack, selectedItemId],
  );

  const handleUpdateUnmanagedName = useCallback(
    async (itemId: string, name: string) => {
      const existing = layoutHosts.find((h) => h.id === itemId);
      if (!existing || !rack) return;

      setLayoutHosts((prev) =>
        prev.map((h) => (h.id === itemId ? { ...h, name } : h)),
      );

      try {
        const input = layoutHostToHostInput(existing, rackIdParam);
        await updateHost(itemId, { ...input, name });
      } catch (error) {
        await loadRack();
        toastApiError(error, "Failed to update item");
      }
    },
    [layoutHosts, loadRack, rack, rackIdParam],
  );

  const onSelectZone = useCallback(
    (zone: ZoneSelection) => {
      const bottomU = zone.startU - zone.heightU + 1;
      if (bottomU < 1) {
        toast.error("Selection does not fit rack height");
        return;
      }
      setPending(makePendingHost(zone, defaultSshPort));
    },
    [defaultSshPort],
  );

  const updateItemPosition = useCallback(
    async (
      itemId: string,
      position: {
        position_u_start: number;
        position_u_height: number;
        position_col_start: number;
        position_col_count: number;
      },
    ) => {
      if (!rack) return;
      const existing = layoutHosts.find((n) => n.id === itemId);
      if (!existing) return;

      setLayoutHosts((prev) =>
        prev.map((h) => (h.id === itemId ? { ...h, ...position } : h)),
      );

      try {
        const input = layoutHostToHostInput(existing, rackIdParam);
        await updateHost(itemId, {
          ...input,
          placement: {
            rack: rackIdParam,
            u_start: position.position_u_start,
            u_height: position.position_u_height,
            col_start: position.position_col_start,
            col_count: position.position_col_count,
          },
        });
      } catch (error) {
        await loadRack();
        toastApiError(error, "Failed to update item");
      }
    },
    [layoutHosts, loadRack, rack, rackIdParam],
  );

  const persistRackFrame = useCallback(
    async (nextWidth: 10 | 19, nextUnits: number, nextCols: number) => {
      if (!rack) return false;
      try {
        const result = await updateRack(rack.id, {
          rack_width_inches: nextWidth,
          rack_units: nextUnits,
          rack_cols: nextCols,
        });
        setLayout({ ...layout!, ...result.rack, hosts: layout!.hosts });
        setRackWidthDraft(result.rack.rack_width_inches);
        setRackUnitsDraft(result.rack.rack_units);
        setRackColsDraft(result.rack.rack_cols);
        return true;
      } catch (error) {
        toastApiError(error, "Failed to update rack frame");
        return false;
      }
    },
    [layout, rack],
  );

  const persistRackName = useCallback(async () => {
    if (!rack) return false;
    const trimmedName = rackNameDraft.trim();
    if (!trimmedName) {
      toast.error("Rack name is required");
      setRackNameDraft(rack.name);
      return false;
    }
    if (trimmedName === rack.name) return true;

    setSaving(true);
    try {
      const result = await updateRack(rack.id, { name: trimmedName });
      setLayout({ ...layout!, ...result.rack, hosts: layout!.hosts });
      setRackNameDraft(result.rack.name);
      return true;
    } catch (error) {
      toastApiError(error, "Failed to update rack name");
      return false;
    } finally {
      setSaving(false);
    }
  }, [layout, rack, rackNameDraft]);

  const activateFrameEdit = useCallback(async () => {
    if (!rack) return;
    const placedCount = layoutHosts.filter(
      (n) => n.placement === "rack",
    ).length;
    const confirmed =
      placedCount === 0 ||
      window.confirm(
        "Changing the rack frame will unassign all nodes from this rack. Continue?",
      );
    if (!confirmed) return;

    if (placedCount > 0) {
      await unassignAllHostsFromRack();
    }
    setFrameControlsVisible(true);
  }, [layoutHosts, rack, unassignAllHostsFromRack]);

  if (loading) return <DetailLoading message="Loading rack..." />;
  if (!rack) return <DetailNotFound title="Rack not found" description="This rack does not exist in the active repo anymore." backPath="/racks/create" backLabel="Create a rack" />;

  return (
    <PageContainer maxWidth="max-w-7xl">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              {editingName ? (
                <Input
                  autoFocus
                  value={rackNameDraft}
                  onChange={(e) => setRackNameDraft(e.target.value)}
                  onBlur={() => {
                    setEditingName(false);
                    void persistRackName();
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      setEditingName(false);
                      await persistRackName();
                    }
                    if (e.key === "Escape") {
                      setRackNameDraft(rack.name);
                      setEditingName(false);
                    }
                  }}
                  className="h-9 w-full max-w-sm text-base font-semibold"
                />
              ) : (
                <h1
                  className="text-zinc-100 font-semibold"
                  onDoubleClick={() => setEditingName(true)}
                >
                  {rackNameDraft || "Untitled rack"}
                </h1>
              )}
              <p className="text-xs text-zinc-500">
                Place and organize hardware in this rack.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!frameControlsVisible ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void activateFrameEdit()}
                >
                  Change rack frame
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await deleteRack(rack.id);
                    toast.success("Rack deleted");
                    navigate("/?view=rack", { replace: true });
                  } catch (error) {
                    toastApiError(error, "Failed to delete rack");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Delete rack
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{rack.rack_width_inches}"</Badge>
            <Badge variant="outline">{rack.rack_units}U</Badge>
            <Badge variant="outline">{rack.rack_cols} cols</Badge>
            <Badge variant="secondary">{managedItemCount} managed</Badge>
            <Badge variant="outline">{unmanagedItemCount} unmanaged</Badge>
          </div>
        </section>

        <RackBuilder
          title=""
          description=""
          showLeftPanel={false}
          showFrameControls={frameControlsVisible}
          rackWidth={rackWidthDraft}
          rackUnits={rackUnitsDraft}
          rackCols={rackColsDraft}
          rackName={rackNameDraft}
          items={layoutHosts}
          selectedItemId={selectedItemId}
          pending={pending}
          saving={saving}
          frameEditorSlot={
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-zinc-100">Adjust rack dimensions</p>
                <p className="text-xs text-zinc-500">
                  All nodes were unassigned from this rack before frame editing
                  was enabled.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">Rack width</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={rackWidthDraft === 19 ? "default" : "outline"}
                    size="sm"
                    onClick={async () => {
                      setRackWidthDraft(19);
                      setRackColsDraft(12);
                      await persistRackFrame(19, rackUnitsDraft, 12);
                    }}
                  >
                    19"
                  </Button>
                  <Button
                    type="button"
                    variant={rackWidthDraft === 10 ? "default" : "outline"}
                    size="sm"
                    onClick={async () => {
                      setRackWidthDraft(10);
                      setRackColsDraft(6);
                      await persistRackFrame(10, rackUnitsDraft, 6);
                    }}
                  >
                    10"
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-zinc-400">
                  Rack units: {rackUnitsDraft}U
                </p>
                <Slider
                  min={1}
                  max={52}
                  step={1}
                  value={[rackUnitsDraft]}
                  onValueChange={([units]) => {
                    setRackUnitsDraft(units ?? 12);
                  }}
                  onValueCommit={([units]) =>
                    void persistRackFrame(
                      rackWidthDraft,
                      units ?? rackUnitsDraft,
                      rackColsDraft,
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-zinc-400">
                  Columns: {rackColsDraft}
                </p>
                <Slider
                  min={2}
                  max={48}
                  step={1}
                  value={[rackColsDraft]}
                  onValueChange={([cols]) => {
                    setRackColsDraft(cols ?? 12);
                  }}
                  onValueCommit={([cols]) =>
                    void persistRackFrame(
                      rackWidthDraft,
                      rackUnitsDraft,
                      cols ?? rackColsDraft,
                    )
                  }
                />
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => setFrameControlsVisible(false)}
                >
                  Confirm rack dimensions
                </Button>
              </div>
            </div>
          }
          onRackWidthChange={(width, cols) => {
            setRackWidthDraft(width);
            setRackColsDraft(cols);
          }}
          onRackUnitsChange={(units) => {
            setRackUnitsDraft(units);
          }}
          onRackColsChange={(cols) => {
            setRackColsDraft(cols);
          }}
          onRackNameChange={setRackNameDraft}
          onSelectItem={setSelectedItemId}
          onSelectZone={onSelectZone}
          onMoveItem={(itemId, position) =>
            void updateItemPosition(itemId, position)
          }
          onResizeItem={(itemId, position) =>
            void updateItemPosition(itemId, position)
          }
          onPendingChange={(patch) =>
            setPending((prev) => (prev ? { ...prev, ...patch } : prev))
          }
          onPlacePending={async () => {
            if (!pending) return;
            setSaving(true);
            try {
              const frameSaved = await ensureFrameDraftSaved();
              if (!frameSaved) return;
              const { host } = await createHost(
                pendingToHostInput(pending, rackIdParam),
              );
              await loadRack(host.id);
              setPending(null);
              toast.success("Item added");
            } catch (error) {
              toastApiError(error, "Failed to add item");
            } finally {
              setSaving(false);
            }
          }}
          onCancelPending={() => setPending(null)}
          unplacedHosts={unplacedHosts.map((n) => ({
            id: n.id,
            name: n.name ?? "",
            hostname: n.hostname ?? "",
            ip_address: n.ip_address ?? "",
          }))}
          onPlaceUnplacedHost={handlePlaceUnplacedHost}
          onUnplaceHost={handleUnplaceHost}
          onDeleteItem={(itemId) => void handleDeleteItem(itemId)}
          onUpdateItemName={(itemId, name) => void handleUpdateUnmanagedName(itemId, name)}
        />
    </PageContainer>
  );
}
