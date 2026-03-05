import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { RackCanvas } from "@/components/rack-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { RackDetail, RackItem, ZoneSelection } from "@/lib/racks";

type PendingPlacement = Omit<RackItem, "id"> & { id: string };

function makeItemId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function RackDetailPage() {
  const { rackId } = useParams<{ rackId: string }>();
  const [rack, setRack] = useState<RackDetail | null>(null);
  const [items, setItems] = useState<RackItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPlacement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const selectionMode = true;

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  const reload = useCallback(async () => {
    if (!rackId) return;
    const data = await apiGet<{
      rack: RackDetail;
      items: RackItem[];
    }>(`/racks/${rackId}`);
    setRack(data.rack);
    setItems(data.items);
  }, [rackId]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!rackId) {
        setLoading(false);
        return;
      }
      try {
        await reload();
      } catch (error) {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Failed to load rack");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [rackId, reload]);

  const onSelectZone = useCallback(
    (zone: ZoneSelection) => {
      if (!rack) return;
      const bottomU = zone.startU - zone.heightU + 1;
      if (bottomU < 1) {
        toast.error("Selection does not fit rack height");
        return;
      }
      setPending({
        id: makeItemId(),
        position_u_start: bottomU,
        position_u_height: zone.heightU,
        position_col_start: zone.startCol,
        position_col_count: zone.colCount,
        has_no_ip: false,
        ip_address: "",
        name: null,
      });
    },
    [rack]
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
      action: "move" | "resize"
    ) => {
      if (!rackId) return;
      setSaving(true);
      try {
        await apiPatch(`/racks/${rackId}/items/${itemId}`, {
          ...position,
          has_no_ip: items.find((i) => i.id === itemId)?.has_no_ip ?? false,
          ip_address: items.find((i) => i.id === itemId)?.ip_address ?? null,
          name: items.find((i) => i.id === itemId)?.name ?? undefined,
        });
        toast.success(action === "move" ? "Item moved" : "Item resized");
        await reload();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update item");
      } finally {
        setSaving(false);
      }
    },
    [items, rackId, reload]
  );

  if (!rackId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Invalid rack ID.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4">
      {loading ? (
        <p className="text-zinc-500 text-sm">Loading rack...</p>
      ) : !rack ? (
        <p className="text-zinc-500 text-sm">Rack not found.</p>
      ) : (
        <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <Link to="/racks" className="text-zinc-400 hover:text-zinc-200 text-sm">
                Back
              </Link>
              <h1 className="text-zinc-100 font-semibold">{rack.name || `${rack.owner_login}'s rack`}</h1>
              <p className="text-zinc-500 text-xs">
                {rack.rack_width_inches}" • {rack.rack_units}U • {rack.rack_cols ?? (rack.rack_width_inches === 10 ? 6 : 12)} cols
              </p>
            </div>
            <p className="text-xs text-zinc-400">
              Drag to select a zone to add a block. Drag from center to move, from edges to resize.
            </p>
            <RackCanvas
              rackUnits={rack.rack_units}
              cols={rack.rack_cols ?? (rack.rack_width_inches === 10 ? 6 : 12)}
              items={items}
              selectedItemId={selectedItemId}
              onSelectItem={setSelectedItemId}
              onSelectZone={onSelectZone}
              onMoveItem={(id, pos) => updateItemPosition(id, pos, "move")}
              onResizeItem={(id, pos) => updateItemPosition(id, pos, "resize")}
              selectionMode={selectionMode}
            />
          </section>

          <section className="space-y-3 border border-zinc-800 bg-zinc-900/30 p-4">
            {pending && (
              <div className="space-y-2">
                <h3 className="text-xs text-zinc-300">Place new block</h3>
                <p className="text-[11px] text-zinc-500">
                  {pending.position_u_height}U × {pending.position_col_count} col
                  {pending.position_col_count > 1 ? "s" : ""}
                </p>
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={pending.has_no_ip}
                    onChange={(event) =>
                      setPending((prev) =>
                        prev
                          ? {
                              ...prev,
                              has_no_ip: event.target.checked,
                              ip_address: event.target.checked ? null : "",
                            }
                          : prev
                      )
                    }
                  />
                  Has no IP
                </label>
                {!pending.has_no_ip && (
                  <Input
                    value={pending.ip_address ?? ""}
                    onChange={(event) =>
                      setPending((prev) => (prev ? { ...prev, ip_address: event.target.value } : prev))
                    }
                    placeholder="IP address"
                  />
                )}
                <Input
                  value={pending.name ?? ""}
                  onChange={(event) =>
                    setPending((prev) => (prev ? { ...prev, name: event.target.value || null } : prev))
                  }
                  placeholder="Name (optional)"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={async () => {
                      if (!pending) return;
                      setSaving(true);
                      try {
                        await apiPost(`/racks/${rackId}/items`, {
                          ...pending,
                          name: pending.name || undefined,
                        });
                        setPending(null);
                        await reload();
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to place item");
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Place item
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPending(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="border-t border-zinc-800 pt-3 space-y-2">
              <h2 className="text-sm text-zinc-100 font-semibold">Selected item</h2>
              {!selectedItem ? (
                <p className="text-xs text-zinc-500">Select a placed item to edit.</p>
              ) : (
                <>
                  <p className="text-[11px] text-zinc-500">
                    {selectedItem.position_u_height}U × {selectedItem.position_col_count} col
                    {selectedItem.position_col_count > 1 ? "s" : ""}
                  </p>
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={selectedItem.has_no_ip}
                      onChange={(event) =>
                        setItems((prev) =>
                          prev.map((item) =>
                            item.id === selectedItem.id
                              ? {
                                  ...item,
                                  has_no_ip: event.target.checked,
                                  ip_address: event.target.checked ? null : "",
                                }
                              : item
                          )
                        )
                      }
                    />
                    Has no IP
                  </label>
                  {!selectedItem.has_no_ip && (
                    <Input
                      value={selectedItem.ip_address ?? ""}
                      onChange={(event) =>
                        setItems((prev) =>
                          prev.map((item) =>
                            item.id === selectedItem.id ? { ...item, ip_address: event.target.value } : item
                          )
                        )
                      }
                      placeholder="IP address"
                    />
                  )}
                  <Input
                    value={selectedItem.name ?? ""}
                    onChange={(event) =>
                      setItems((prev) =>
                        prev.map((item) =>
                          item.id === selectedItem.id ? { ...item, name: event.target.value || null } : item
                        )
                      )
                    }
                    placeholder="Name (optional)"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true);
                        try {
                          await apiPatch(`/racks/${rackId}/items/${selectedItem.id}`, {
                            position_u_start: selectedItem.position_u_start,
                            position_u_height: selectedItem.position_u_height,
                            position_col_start: selectedItem.position_col_start,
                            position_col_count: selectedItem.position_col_count,
                            has_no_ip: selectedItem.has_no_ip,
                            ip_address: selectedItem.ip_address,
                            name: selectedItem.name || undefined,
                          });
                          toast.success("Item updated");
                          await reload();
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Failed to update item");
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      Save item
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true);
                        try {
                          await apiDelete(`/racks/${rackId}/items/${selectedItem.id}`);
                          setSelectedItemId(null);
                          toast.success("Item removed");
                          await reload();
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Failed to delete item");
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
