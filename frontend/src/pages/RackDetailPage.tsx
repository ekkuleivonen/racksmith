import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { RackBuilder } from "@/components/racks/rack-builder";
import type { PendingNode } from "@/components/racks/rack-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  deleteRack,
  getRackLayout,
  nodeToRackLayoutNode,
  updateRack,
  type RackLayout,
  type ZoneSelection,
} from "@/lib/racks";
import {
  createNode,
  deleteNode,
  getNode,
  isReachableNode,
  refreshNode,
  updateNode,
  type NodeInput,
} from "@/lib/nodes";
import { useNodesStore } from "@/stores/nodes";
import { useRackStore } from "@/stores/racks";
import { listRacks } from "@/lib/racks";

function makePendingNode(zone: ZoneSelection): PendingNode {
  const bottomU = zone.startU - zone.heightU + 1;
  return {
    slug: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    host: "",
    managed: true,
    placement: "rack",
    position_u_start: bottomU,
    position_u_height: zone.heightU,
    position_col_start: zone.startCol,
    position_col_count: zone.colCount,
    ssh_user: "",
    ssh_port: 22,
    tags: [],
  };
}

function pendingToNodeInput(pending: PendingNode, rackSlug: string): NodeInput {
  return {
    name: pending.name,
    host: pending.host,
    ssh_user: pending.ssh_user,
    ssh_port: pending.ssh_port,
    managed: pending.managed,
    tags: pending.tags ?? [],
    os_family: pending.os_family ?? null,
    notes: pending.notes,
    placement: {
      rack: rackSlug,
      u_start: pending.position_u_start,
      u_height: pending.position_u_height,
      col_start: pending.position_col_start,
      col_count: pending.position_col_count,
    },
  };
}

function layoutNodeToNodeInput(
  node: ReturnType<typeof nodeToRackLayoutNode>,
  rackSlug: string
): NodeInput {
  return {
    name: node.name,
    host: node.host,
    ssh_user: node.ssh_user,
    ssh_port: node.ssh_port,
    managed: node.managed,
    groups: node.groups,
    tags: node.tags ?? [],
    os_family: node.os_family ?? null,
    notes: node.notes,
    placement:
      node.placement === "rack"
        ? {
            rack: rackSlug,
            u_start: node.position_u_start,
            u_height: node.position_u_height,
            col_start: node.position_col_start,
            col_count: node.position_col_count,
          }
        : null,
  };
}

export function RackPage() {
  const { rackSlug = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const highlightedNodeSlug = new URLSearchParams(location.search).get("nodeSlug");

  const [layout, setLayout] = useState<RackLayout | null>(null);
  const [layoutNodes, setLayoutNodes] = useState<ReturnType<typeof nodeToRackLayoutNode>[]>([]);
  const [selectedItemSlug, setSelectedItemSlug] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rackNameDraft, setRackNameDraft] = useState("");
  const [rackWidthDraft, setRackWidthDraft] = useState<10 | 19>(19);
  const [rackUnitsDraft, setRackUnitsDraft] = useState(12);
  const [rackColsDraft, setRackColsDraft] = useState(12);
  const [frameControlsVisible, setFrameControlsVisible] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const nodesFromStore = useNodesStore((s) => s.nodes);
  const loadNodes = useNodesStore((s) => s.load);
  const loadRacks = useRackStore((s) => s.load);

  const rack = layout;

  const unplacedNodes = useMemo(() => {
    if (!rackSlug) return [];
    return nodesFromStore.filter(
      (n) => !n.placement || n.placement.rack !== rackSlug
    );
  }, [nodesFromStore, rackSlug]);

  const selectedItem = useMemo(
    () => layoutNodes.find((item) => item.slug === selectedItemSlug) ?? null,
    [layoutNodes, selectedItemSlug],
  );
  const managedItemCount = useMemo(
    () => layoutNodes.filter((item) => item.managed).length,
    [layoutNodes],
  );
  const unmanagedItemCount = layoutNodes.length - managedItemCount;

  const loadRack = useCallback(async (preserveSlug?: string) => {
    if (!rackSlug) {
      setLayout(null);
      setLayoutNodes([]);
      return;
    }

    const { layout: data } = await getRackLayout(rackSlug);
    setLayout(data);
    setRackNameDraft(data.name);
    setRackWidthDraft(data.rack_width_inches);
    setRackUnitsDraft(data.rack_units);
    setRackColsDraft(data.rack_cols);
    const nodes = data.nodes.map(nodeToRackLayoutNode);
    setLayoutNodes(nodes);
    setSelectedItemSlug((prev) => {
      const slugToKeep = preserveSlug ?? prev;
      if (slugToKeep && nodes.some((n) => n.slug === slugToKeep)) return slugToKeep;
      if (highlightedNodeSlug && nodes.some((n) => n.slug === highlightedNodeSlug)) return highlightedNodeSlug;
      return null;
    });
  }, [highlightedNodeSlug, rackSlug]);

  useEffect(() => {
    let active = true;
    void loadRack()
      .catch((error) => {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Failed to load rack");
        setLayout(null);
        setLayoutNodes([]);
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
    const current = params.get("nodeSlug");
    if (selectedItemSlug) {
      if (current === selectedItemSlug) return;
      params.set("nodeSlug", selectedItemSlug);
    } else {
      if (!current) return;
      params.delete("nodeSlug");
    }
    const nextSearch = params.toString();
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "" }, { replace: true });
  }, [location.pathname, location.search, navigate, selectedItemSlug]);

  useEffect(() => setPending(null), [rackSlug]);
  useEffect(() => setFrameControlsVisible(false), [rackSlug]);
  useEffect(() => setEditingName(false), [rackSlug]);

  useEffect(() => {
    if (rackSlug) void loadNodes();
  }, [rackSlug, loadNodes]);

  const ensureFrameDraftSaved = useCallback(async () => {
    if (!rack) return false;
    const frameChanged =
      rackWidthDraft !== rack.rack_width_inches ||
      rackUnitsDraft !== rack.rack_units ||
      rackColsDraft !== rack.rack_cols;
    if (!frameChanged) return true;

    try {
      const result = await updateRack(rack.slug, {
        rack_width_inches: rackWidthDraft,
        rack_units: rackUnitsDraft,
        rack_cols: rackColsDraft,
      });
      setLayout({ ...layout!, ...result.rack, nodes: layout!.nodes });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update rack frame");
      return false;
    }
  }, [layout, rack, rackColsDraft, rackUnitsDraft, rackWidthDraft]);

  const unassignAllNodesFromRack = useCallback(async () => {
    if (!rack) return;
    const nodesOnRack = layoutNodes.filter((n) => n.placement === "rack");
    if (nodesOnRack.length === 0) return;
    setSaving(true);
    try {
      const frameSaved = await ensureFrameDraftSaved();
      if (!frameSaved) return;
      await Promise.all(
        nodesOnRack.map((node) => {
          const input = layoutNodeToNodeInput(node, rackSlug);
          return updateNode(node.slug, { ...input, placement: null });
        }),
      );
      await loadRack();
      await loadNodes();
      await loadRacks();
      toast.success("Nodes unassigned. You can now change the rack frame.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unassign nodes");
    } finally {
      setSaving(false);
    }
  }, [ensureFrameDraftSaved, layoutNodes, loadRack, loadNodes, loadRacks, rack, rackSlug]);

  const handlePlaceUnplacedNode = useCallback(
    async (
      nodeSlug: string,
      position: {
        position_u_start: number;
        position_u_height: number;
        position_col_start: number;
        position_col_count: number;
      },
    ) => {
      if (!rack) return;
      setSaving(true);
      try {
        const frameSaved = await ensureFrameDraftSaved();
        if (!frameSaved) return;
        const { node } = await getNode(nodeSlug);
        await updateNode(nodeSlug, {
          name: node.name ?? "",
          host: node.host ?? "",
          ssh_user: node.ssh_user ?? "",
          ssh_port: node.ssh_port ?? 22,
          managed: node.managed ?? true,
          groups: node.groups ?? [],
          tags: node.tags ?? [],
          os_family: node.os_family ?? null,
          notes: node.notes ?? "",
          placement: {
            rack: rackSlug,
            u_start: position.position_u_start,
            u_height: position.position_u_height,
            col_start: position.position_col_start,
            col_count: position.position_col_count,
          },
        });
        await loadRack();
        await loadNodes();
        await loadRacks();
        toast.success("Node placed on rack");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to place node");
      } finally {
        setSaving(false);
      }
    },
    [ensureFrameDraftSaved, loadRack, loadNodes, loadRacks, rack, rackSlug],
  );

  const handleUnplaceNode = useCallback(
    async (nodeSlug: string) => {
      const existing = layoutNodes.find((n) => n.slug === nodeSlug);
      if (!existing || !rack) return;
      setSaving(true);
      try {
        const frameSaved = await ensureFrameDraftSaved();
        if (!frameSaved) return;
        const input = layoutNodeToNodeInput(existing, rackSlug);
        await updateNode(nodeSlug, { ...input, placement: null });
        await loadRack();
        await loadNodes();
        await loadRacks();
        toast.success("Node unplaced");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to unplace node");
      } finally {
        setSaving(false);
      }
    },
    [ensureFrameDraftSaved, layoutNodes, loadRack, loadNodes, loadRacks, rack, rackSlug],
  );

  const onSelectZone = useCallback((zone: ZoneSelection) => {
    const bottomU = zone.startU - zone.heightU + 1;
    if (bottomU < 1) {
      toast.error("Selection does not fit rack height");
      return;
    }
    setPending(makePendingNode(zone));
  }, [rackSlug]);

  const updateItemPosition = useCallback(
    async (
      slug: string,
      position: {
        position_u_start: number;
        position_u_height: number;
        position_col_start: number;
        position_col_count: number;
      },
    ) => {
      if (!rack) return;
      const existing = layoutNodes.find((n) => n.slug === slug);
      if (!existing) return;

      setSaving(true);
      try {
        const frameSaved = await ensureFrameDraftSaved();
        if (!frameSaved) return;
        const input = layoutNodeToNodeInput(existing, rackSlug);
        await updateNode(slug, {
          ...input,
          placement: {
            rack: rackSlug,
            u_start: position.position_u_start,
            u_height: position.position_u_height,
            col_start: position.position_col_start,
            col_count: position.position_col_count,
          },
        });
        await loadRack();
        await loadRacks();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update item");
      } finally {
        setSaving(false);
      }
    },
    [ensureFrameDraftSaved, layoutNodes, loadRack, loadRacks, rack, rackSlug],
  );

  const persistRackFrame = useCallback(
    async (nextWidth: 10 | 19, nextUnits: number, nextCols: number) => {
      if (!rack) return false;
      try {
        const result = await updateRack(rack.slug, {
          rack_width_inches: nextWidth,
          rack_units: nextUnits,
          rack_cols: nextCols,
        });
        setLayout({ ...layout!, ...result.rack, nodes: layout!.nodes });
        setRackWidthDraft(result.rack.rack_width_inches);
        setRackUnitsDraft(result.rack.rack_units);
        setRackColsDraft(result.rack.rack_cols);
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update rack frame");
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
      const result = await updateRack(rack.slug, { name: trimmedName });
      setLayout({ ...layout!, ...result.rack, nodes: layout!.nodes });
      setRackNameDraft(result.rack.name);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update rack name");
      return false;
    } finally {
      setSaving(false);
    }
  }, [layout, rack, rackNameDraft]);

  const activateFrameEdit = useCallback(async () => {
    if (!rack) return;
    const placedCount = layoutNodes.filter((n) => n.placement === "rack").length;
    const confirmed =
      placedCount === 0 ||
      window.confirm("Changing the rack frame will unassign all nodes from this rack. Continue?");
    if (!confirmed) return;

    if (placedCount > 0) {
      await unassignAllNodesFromRack();
    }
    setFrameControlsVisible(true);
  }, [layoutNodes, rack, unassignAllNodesFromRack]);

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
            <p className="text-sm text-zinc-500">This rack does not exist in the active repo anymore.</p>
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
                Rack definitions are stored under `.racksmith/racks` in the active repo.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!frameControlsVisible ? (
                <Button size="sm" variant="outline" disabled={saving} onClick={() => void activateFrameEdit()}>
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
                    await deleteRack(rack.slug);
                    const remaining = await listRacks();
                    toast.success("Rack deleted");
                    navigate(
                      remaining[0] ? `/rack/view/${remaining[0].slug}` : "/rack/create",
                      { replace: true },
                    );
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Failed to delete rack");
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
          items={layoutNodes}
          selectedItemSlug={selectedItemSlug}
          pending={pending}
          saving={saving}
          frameEditorSlot={
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-zinc-100">Adjust rack dimensions</p>
                <p className="text-xs text-zinc-500">
                  All nodes were unassigned from this rack before frame editing was enabled.
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
                <p className="text-xs text-zinc-400">Rack units: {rackUnitsDraft}U</p>
                <Slider
                  min={1}
                  max={52}
                  step={1}
                  value={[rackUnitsDraft]}
                  onValueChange={([units]) => {
                    setRackUnitsDraft(units ?? 12);
                  }}
                  onValueCommit={([units]) =>
                    void persistRackFrame(rackWidthDraft, units ?? rackUnitsDraft, rackColsDraft)
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
                    setRackColsDraft(cols ?? 12);
                  }}
                  onValueCommit={([cols]) =>
                    void persistRackFrame(rackWidthDraft, rackUnitsDraft, cols ?? rackColsDraft)
                  }
                />
              </div>
              <div className="flex justify-end">
                <Button size="sm" disabled={saving} onClick={() => setFrameControlsVisible(false)}>
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
          onSelectItem={setSelectedItemSlug}
          onSelectZone={onSelectZone}
          onMoveItem={(slug, position) => void updateItemPosition(slug, position)}
          onResizeItem={(slug, position) => void updateItemPosition(slug, position)}
          onPendingChange={(patch) => setPending((prev) => (prev ? { ...prev, ...patch } : prev))}
          onPlacePending={async () => {
            if (!pending) return;
            setSaving(true);
            try {
              const frameSaved = await ensureFrameDraftSaved();
              if (!frameSaved) return;
              const { node } = await createNode(pendingToNodeInput(pending, rackSlug));
              await loadRack(node.slug);
              await loadRacks();
              setPending(null);
              toast.success("Item added");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to add item");
            } finally {
              setSaving(false);
            }
          }}
          onCancelPending={() => setPending(null)}
          unplacedNodes={unplacedNodes.map((n) => ({
            slug: n.slug,
            name: n.name ?? "",
            host: n.host ?? "",
          }))}
          onPlaceUnplacedNode={handlePlaceUnplacedNode}
          onUnplaceNode={handleUnplaceNode}
          onSelectedItemChange={(patch) => {
            if (!selectedItem) return;
            setLayoutNodes((prev) =>
              prev.map((item) => (item.slug === selectedItem.slug ? { ...item, ...patch } : item)),
            );
          }}
          selectedItemActionSlot={
            selectedItem?.managed ? (
              <>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={saving || !isReachableNode(selectedItem)}
                  aria-label="Rediscover item"
                  title="Rediscover item"
                    onClick={async () => {
                    setSaving(true);
                    try {
                      await refreshNode(selectedItem.slug);
                      await loadRack();
                      await loadRacks();
                      toast.success("Item rediscovered");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Failed to rediscover item");
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
                  aria-label="Open node page"
                  title="Open node page"
                  onClick={() => navigate(`/nodes/${selectedItem.slug}`)}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              </>
            ) : null
          }
          onSaveSelected={async () => {
            if (!selectedItem) return;
            const slugToKeep = selectedItem.slug;
            setSaving(true);
            try {
              const input = layoutNodeToNodeInput(selectedItem, rackSlug);
              const placement = selectedItem.placement === "rack" ? {
                rack: rackSlug,
                u_start: selectedItem.position_u_start,
                u_height: selectedItem.position_u_height,
                col_start: selectedItem.position_col_start,
                col_count: selectedItem.position_col_count,
              } : null;
              await updateNode(slugToKeep, { ...input, placement });
              await loadRack(slugToKeep);
              await loadRacks();
              toast.success("Item updated");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to update item");
            } finally {
              setSaving(false);
            }
          }}
          onDeleteSelected={async () => {
            if (!selectedItem) return;
            setSaving(true);
            try {
              await deleteNode(selectedItem.slug);
              await loadRack();
              await loadRacks();
              setSelectedItemSlug(null);
              toast.success("Item deleted");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to delete item");
            } finally {
              setSaving(false);
            }
          }}
        />
      </div>
    </div>
  );
}
