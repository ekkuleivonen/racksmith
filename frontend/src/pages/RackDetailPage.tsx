import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { RackBuilder } from "@/pages/RackOnboardingPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  addRackItem,
  deleteRack,
  deleteRackItem,
  getRack,
  isReachableRackItem,
  listRacks,
  refreshRackItem,
  updateRack,
  updateRackItem,
  type RackDetail,
  type RackItem,
  type ZoneSelection,
} from "@/lib/racks";

function makeItemId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makePendingItem(zone: ZoneSelection): RackItem {
  const bottomU = zone.startU - zone.heightU + 1;
  return {
    id: makeItemId(),
    placement: "rack",
    managed: true,
    position_u_start: bottomU,
    position_u_height: zone.heightU,
    position_col_start: zone.startCol,
    position_col_count: zone.colCount,
    host: "",
    name: "",
    mac_address: "",
    os: "",
    ssh_user: "",
    ssh_port: 22,
    tags: [],
  };
}

function toRackItemInput(item: RackItem) {
  return {
    placement: item.placement,
    managed: item.managed,
    name: item.name,
    position_u_start: item.position_u_start,
    position_u_height: item.position_u_height,
    position_col_start: item.position_col_start,
    position_col_count: item.position_col_count,
    host: item.host,
    os: item.os,
    ssh_user: item.ssh_user,
    ssh_port: item.ssh_port,
    tags: item.tags,
  };
}

export function RackPage() {
  const { rackId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const highlightedItemId = new URLSearchParams(location.search).get("itemId");

  const [rack, setRack] = useState<RackDetail | null>(null);
  const [items, setItems] = useState<RackItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [pending, setPending] = useState<RackItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rackNameDraft, setRackNameDraft] = useState("");
  const [rackWidthDraft, setRackWidthDraft] = useState<10 | 19>(19);
  const [rackUnitsDraft, setRackUnitsDraft] = useState(12);
  const [rackColsDraft, setRackColsDraft] = useState(12);
  const [frameControlsVisible, setFrameControlsVisible] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );
  const managedItemCount = useMemo(
    () => items.filter((item) => item.managed).length,
    [items]
  );
  const unmanagedItemCount = items.length - managedItemCount;

  const loadRack = useCallback(async () => {
    if (!rackId) {
      setRack(null);
      setItems([]);
      return;
    }

    const data = await getRack(rackId);
    setRack(data.rack);
    setRackNameDraft(data.rack.name);
    setRackWidthDraft(data.rack.rack_width_inches);
    setRackUnitsDraft(data.rack.rack_units);
    setRackColsDraft(data.rack.rack_cols);
    setItems(data.items);
    setSelectedItemId((previousSelectedItemId) => {
      if (
        previousSelectedItemId &&
        data.items.some((item) => item.id === previousSelectedItemId)
      ) {
        return previousSelectedItemId;
      }
      if (
        highlightedItemId &&
        data.items.some((item) => item.id === highlightedItemId)
      ) {
        return highlightedItemId;
      }
      return null;
    });
  }, [highlightedItemId, rackId]);

  useEffect(() => {
    let active = true;
    void loadRack()
      .catch((error) => {
        if (!active) return;
        toast.error(
          error instanceof Error ? error.message : "Failed to load rack",
        );
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
    const params = new URLSearchParams(location.search);
    const currentItemId = params.get("itemId");
    if (selectedItemId) {
      if (currentItemId === selectedItemId) return;
      params.set("itemId", selectedItemId);
    } else {
      if (!currentItemId) return;
      params.delete("itemId");
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

  useEffect(() => {
    setPending(null);
  }, [rackId]);

  useEffect(() => {
    setFrameControlsVisible(false);
  }, [rackId]);

  useEffect(() => {
    setEditingName(false);
  }, [rackId]);

  const onSelectZone = useCallback((zone: ZoneSelection) => {
    const bottomU = zone.startU - zone.heightU + 1;
    if (bottomU < 1) {
      toast.error("Selection does not fit rack height");
      return;
    }
    setPending(makePendingItem(zone));
  }, []);

  const parkItemsLocally = useCallback(() => {
    setItems((prev) =>
      prev.map((item) => (item.placement === "rack" ? { ...item, placement: "parked" } : item))
    );
  }, []);

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
      setRack(result.rack);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update rack frame",
      );
      return false;
    }
  }, [rack, rackColsDraft, rackUnitsDraft, rackWidthDraft]);

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
      const existing = items.find((item) => item.id === itemId);
      if (!existing) return;

      setSaving(true);
      try {
        const frameSaved = await ensureFrameDraftSaved();
        if (!frameSaved) return;
        await updateRackItem(rack.id, itemId, {
          ...toRackItemInput(existing),
          ...position,
          placement: "rack",
        });
        await loadRack();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update item",
        );
      } finally {
        setSaving(false);
      }
    },
    [ensureFrameDraftSaved, items, loadRack, rack],
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
        setRack(result.rack);
        setRackWidthDraft(result.rack.rack_width_inches);
        setRackUnitsDraft(result.rack.rack_units);
        setRackColsDraft(result.rack.rack_cols);
        setItems((prev) =>
          prev.map((item) =>
            item.placement === "rack" ? { ...item, placement: "parked" } : item
          )
        );
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update rack frame",
        );
        return false;
      }
    },
    [rack]
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
      setRack(result.rack);
      setRackNameDraft(result.rack.name);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update rack name",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [rack, rackNameDraft]);

  const activateFrameEdit = useCallback(async () => {
    if (!rack) return;
    const confirmed =
      items.filter((item) => item.placement === "rack").length === 0 ||
      window.confirm(
        "Changing the rack frame will park all currently placed items. Continue?"
      );
    if (!confirmed) return;

    if (items.some((item) => item.placement === "rack")) {
      setSaving(true);
      try {
        await updateRack(rack.id, { park_all_items: true });
        await loadRack();
        toast.success("All items parked. You can now change the rack frame.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to park rack items"
        );
        return;
      } finally {
        setSaving(false);
      }
    }

    setFrameControlsVisible(true);
  }, [items, loadRack, rack]);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <p className="text-zinc-500 text-sm">Loading rack...</p>
      </div>
    );
  }

  if (!rack) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="space-y-1">
            <h1 className="text-zinc-100 font-semibold">Rack not found</h1>
            <p className="text-sm text-zinc-500">
              This rack does not exist in the active repo anymore.
            </p>
          </div>
          <Button size="sm" onClick={() => navigate("/rack/create")}>
            Create a rack
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              {editingName ? (
                <Input
                  autoFocus
                  value={rackNameDraft}
                  onChange={(event) => setRackNameDraft(event.target.value)}
                  onBlur={() => {
                    setEditingName(false);
                    void persistRackName();
                  }}
                  onKeyDown={async (event) => {
                    if (event.key === "Enter") {
                      setEditingName(false);
                      await persistRackName();
                    }
                    if (event.key === "Escape") {
                      setRackNameDraft(rack.name);
                      setEditingName(false);
                    }
                  }}
                  className="h-9 w-full max-w-sm text-base font-semibold"
                />
              ) : (
                <h1
                  className="text-zinc-100 font-semibold"
                  onDoubleClick={() => {
                    setEditingName(true);
                  }}
                >
                  {rackNameDraft || "Untitled rack"}
                </h1>
              )}
              <p className="text-xs text-zinc-500">
                Rack definitions are stored under `.racksmith/racks` in the
                active repo.
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
                    const remaining = await listRacks();
                    toast.success("Rack deleted");
                    navigate(
                      remaining[0]
                        ? `/rack/view/${remaining[0].id}`
                        : "/rack/create",
                      { replace: true },
                    );
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Failed to delete rack",
                    );
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
            items={items}
            selectedItemId={selectedItemId}
            pending={pending}
            saving={saving}
            frameEditorSlot={
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm text-zinc-100">Adjust rack dimensions</p>
                  <p className="text-xs text-zinc-500">
                    All currently placed items were parked before frame editing was enabled.
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
                        if (19 !== rackWidthDraft || 12 !== rackColsDraft) parkItemsLocally();
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
                        if (10 !== rackWidthDraft || 6 !== rackColsDraft) parkItemsLocally();
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
                  <p className="text-xs text-zinc-400">Rack units: {rackUnitsDraft}U</p>
                  <Slider
                    min={1}
                    max={52}
                    step={1}
                    value={[rackUnitsDraft]}
                    onValueChange={([units]) => {
                      const nextUnits = units ?? 12;
                      if (nextUnits !== rackUnitsDraft) parkItemsLocally();
                      setRackUnitsDraft(nextUnits);
                    }}
                    onValueCommit={([units]) =>
                      void persistRackFrame(
                        rackWidthDraft,
                        units ?? rackUnitsDraft,
                        rackColsDraft
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-zinc-400">Columns: {rackColsDraft}</p>
                  <Slider
                    min={2}
                    max={48}
                    step={1}
                    value={[rackColsDraft]}
                    onValueChange={([cols]) => {
                      const nextCols = cols ?? 12;
                      if (nextCols !== rackColsDraft) parkItemsLocally();
                      setRackColsDraft(nextCols);
                    }}
                    onValueCommit={([cols]) =>
                      void persistRackFrame(
                        rackWidthDraft,
                        rackUnitsDraft,
                        cols ?? rackColsDraft
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
              if (width !== rackWidthDraft || cols !== rackColsDraft) parkItemsLocally();
              setRackWidthDraft(width);
              setRackColsDraft(cols);
            }}
            onRackUnitsChange={(units) => {
              if (units !== rackUnitsDraft) parkItemsLocally();
              setRackUnitsDraft(units);
            }}
            onRackColsChange={(cols) => {
              if (cols !== rackColsDraft) parkItemsLocally();
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
                await addRackItem(rack.id, pending);
                await loadRack();
                setPending(null);
                toast.success("Item added");
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Failed to add item",
                );
              } finally {
                setSaving(false);
              }
            }}
            onCancelPending={() => setPending(null)}
            onSelectedItemChange={(patch) =>
              setItems((prev) =>
                prev.map((item) =>
                  item.id === selectedItem?.id ? { ...item, ...patch } : item,
                ),
              )
            }
            selectedItemActionSlot={
              selectedItem?.managed ? (
                <>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    disabled={saving || !isReachableRackItem(selectedItem)}
                    aria-label="Rediscover item"
                    title="Rediscover item"
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await refreshRackItem(rack.id, selectedItem.id);
                        await loadRack();
                        toast.success("Item rediscovered");
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Failed to rediscover item",
                        );
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    disabled={saving}
                    aria-label="Open item page"
                    title="Open item page"
                    onClick={() => navigate(`/rack/${rack.id}/item/${selectedItem.id}`)}
                  >
                    <ExternalLink className="size-3.5" />
                  </Button>
                </>
              ) : null
            }
            onSaveSelected={async () => {
              if (!selectedItem) return;
              setSaving(true);
              try {
                await updateRackItem(
                  rack.id,
                  selectedItem.id,
                  toRackItemInput(selectedItem),
                );
                await loadRack();
                toast.success("Item updated");
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Failed to update item",
                );
              } finally {
                setSaving(false);
              }
            }}
            onDeleteSelected={async () => {
              if (!selectedItem) return;
              setSaving(true);
              try {
                await deleteRackItem(rack.id, selectedItem.id);
                await loadRack();
                setSelectedItemId(null);
                toast.success("Item deleted");
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Failed to delete item",
                );
              } finally {
                setSaving(false);
              }
            }}
          />
      </div>
    </div>
  );
}
