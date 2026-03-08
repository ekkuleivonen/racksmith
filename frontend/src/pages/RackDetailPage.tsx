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
  isManagedNode,
  isReachableNode,
  refreshNode,
  updateNode,
  type NodeInput,
} from "@/lib/nodes";
import { useNodes } from "@/hooks/queries";
import { listGroups } from "@/lib/groups";
import { listRacks } from "@/lib/racks";

function makePendingNode(zone: ZoneSelection): PendingNode {
  const bottomU = zone.startU - zone.heightU + 1;
  return {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    hostname: "",
    name: "",
    ip_address: "",
    managed: true,
    placement: "rack",
    position_u_start: bottomU,
    position_u_height: zone.heightU,
    position_col_start: zone.startCol,
    position_col_count: zone.colCount,
    ssh_user: "",
    ssh_port: 22,
    labels: [],
  };
}

function pendingToNodeInput(pending: PendingNode, rackId: string): NodeInput {
  return {
    name: pending.name,
    ip_address: pending.ip_address,
    ssh_user: pending.ssh_user,
    ssh_port: pending.ssh_port,
    managed: pending.managed,
    labels: pending.labels ?? [],
    os_family: pending.os_family ?? null,
    notes: pending.notes,
    placement: {
      rack: rackId,
      u_start: pending.position_u_start,
      u_height: pending.position_u_height,
      col_start: pending.position_col_start,
      col_count: pending.position_col_count,
    },
  };
}

function layoutNodeToNodeInput(
  node: ReturnType<typeof nodeToRackLayoutNode>,
  rackId: string
): NodeInput {
  return {
    name: node.name,
    ip_address: node.ip_address,
    ssh_user: node.ssh_user,
    ssh_port: node.ssh_port,
    managed: node.managed,
    groups: node.groups,
    labels: node.labels ?? [],
    os_family: node.os_family ?? null,
    notes: node.notes,
    placement:
      node.placement === "rack"
        ? {
            rack: rackId,
            u_start: node.position_u_start,
            u_height: node.position_u_height,
            col_start: node.position_col_start,
            col_count: node.position_col_count,
          }
        : null,
  };
}

export function RackPage() {
  const { rackId: rackIdParam = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const highlightedNodeId = new URLSearchParams(location.search).get("nodeId");

  const [layout, setLayout] = useState<RackLayout | null>(null);
  const [layoutNodes, setLayoutNodes] = useState<ReturnType<typeof nodeToRackLayoutNode>[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rackNameDraft, setRackNameDraft] = useState("");
  const [rackWidthDraft, setRackWidthDraft] = useState<10 | 19>(19);
  const [rackUnitsDraft, setRackUnitsDraft] = useState(12);
  const [rackColsDraft, setRackColsDraft] = useState(12);
  const [frameControlsVisible, setFrameControlsVisible] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);

  const { data: nodesFromStore = [] } = useNodes();

  useEffect(() => {
    listGroups()
      .then((list) =>
        setGroups(list.map((g) => ({ id: g.id, name: g.name || g.id }))),
      )
      .catch(() => setGroups([]));
  }, []);

  const rack = layout;

  const unplacedNodes = useMemo(() => {
    if (!rackIdParam) return [];
    return nodesFromStore.filter(
      (n) =>
        isManagedNode(n) && (!n.placement || n.placement.rack !== rackIdParam)
    );
  }, [nodesFromStore, rackIdParam]);

  const selectedItem = useMemo(
    () => layoutNodes.find((item) => item.id === selectedItemId) ?? null,
    [layoutNodes, selectedItemId],
  );
  const managedItemCount = useMemo(
    () => layoutNodes.filter((item) => item.managed).length,
    [layoutNodes],
  );
  const unmanagedItemCount = layoutNodes.length - managedItemCount;

  const loadRack = useCallback(async (preserveId?: string) => {
    if (!rackIdParam) {
      setLayout(null);
      setLayoutNodes([]);
      return;
    }

    const { layout: data } = await getRackLayout(rackIdParam);
    setLayout(data);
    setRackNameDraft(data.name);
    setRackWidthDraft(data.rack_width_inches);
    setRackUnitsDraft(data.rack_units);
    setRackColsDraft(data.rack_cols);
    const nodes = data.nodes.map(nodeToRackLayoutNode);
    setLayoutNodes(nodes);
    setSelectedItemId((prev) => {
      const idToKeep = preserveId ?? prev;
      if (idToKeep && nodes.some((n) => n.id === idToKeep)) return idToKeep;
      if (highlightedNodeId && nodes.some((n) => n.id === highlightedNodeId)) return highlightedNodeId;
      return null;
    });
  }, [highlightedNodeId, rackIdParam]);

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
    const current = params.get("nodeId");
    if (selectedItemId) {
      if (current === selectedItemId) return;
      params.set("nodeId", selectedItemId);
    } else {
      if (!current) return;
      params.delete("nodeId");
    }
    const nextSearch = params.toString();
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "" }, { replace: true });
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
          const input = layoutNodeToNodeInput(node, rackIdParam);
          return updateNode(node.id, { ...input, placement: null });
        }),
      );
      await loadRack();
      toast.success("Nodes unassigned. You can now change the rack frame.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unassign nodes");
    } finally {
      setSaving(false);
    }
  }, [ensureFrameDraftSaved, layoutNodes, loadRack, rack, rackIdParam]);

  const handlePlaceUnplacedNode = useCallback(
    async (
      nodeId: string,
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
        const { node } = await getNode(nodeId);
        await updateNode(nodeId, {
          name: node.name ?? "",
          ip_address: node.ip_address ?? "",
          ssh_user: node.ssh_user ?? "",
          ssh_port: node.ssh_port ?? 22,
          managed: node.managed ?? true,
          groups: node.groups ?? [],
          labels: node.labels ?? [],
          os_family: node.os_family ?? null,
          notes: node.notes ?? "",
          placement: {
            rack: rackIdParam,
            u_start: position.position_u_start,
            u_height: position.position_u_height,
            col_start: position.position_col_start,
            col_count: position.position_col_count,
          },
        });
        await loadRack();
        toast.success("Node placed on rack");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to place node");
      } finally {
        setSaving(false);
      }
    },
    [ensureFrameDraftSaved, loadRack, rack, rackIdParam],
  );

  const handleUnplaceNode = useCallback(
    async (nodeId: string) => {
      const existing = layoutNodes.find((n) => n.id === nodeId);
      if (!existing || !rack) return;
      setSaving(true);
      try {
        const frameSaved = await ensureFrameDraftSaved();
        if (!frameSaved) return;
        const input = layoutNodeToNodeInput(existing, rackIdParam);
        await updateNode(nodeId, { ...input, placement: null });
        await loadRack();
        toast.success("Node unplaced");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to unplace node");
      } finally {
        setSaving(false);
      }
    },
    [ensureFrameDraftSaved, layoutNodes, loadRack, rack, rackIdParam],
  );

  const onSelectZone = useCallback((zone: ZoneSelection) => {
    const bottomU = zone.startU - zone.heightU + 1;
    if (bottomU < 1) {
      toast.error("Selection does not fit rack height");
      return;
    }
    setPending(makePendingNode(zone));
  }, [rackIdParam]);

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
      const existing = layoutNodes.find((n) => n.id === itemId);
      if (!existing) return;

      setSaving(true);
      try {
        const frameSaved = await ensureFrameDraftSaved();
        if (!frameSaved) return;
        const input = layoutNodeToNodeInput(existing, rackIdParam);
        await updateNode(itemId, {
          ...input,
          placement: {
            rack: rackIdParam,
            u_start: position.position_u_start,
            u_height: position.position_u_height,
            col_start: position.position_col_start,
            col_count: position.position_col_count,
          },
        });
        await loadRack();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update item");
      } finally {
        setSaving(false);
      }
    },
    [ensureFrameDraftSaved, layoutNodes, loadRack, rack, rackIdParam],
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
      const result = await updateRack(rack.id, { name: trimmedName });
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
                    await deleteRack(rack.id);
                    const remaining = await listRacks();
                    toast.success("Rack deleted");
                    navigate(
                      remaining[0] ? `/rack/view/${remaining[0].id}` : "/rack/create",
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
          availableGroups={groups}
          showFrameControls={frameControlsVisible}
          rackWidth={rackWidthDraft}
          rackUnits={rackUnitsDraft}
          rackCols={rackColsDraft}
          rackName={rackNameDraft}
          items={layoutNodes}
          selectedItemId={selectedItemId}
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
          onSelectItem={setSelectedItemId}
          onSelectZone={onSelectZone}
          onMoveItem={(itemId, position) => void updateItemPosition(itemId, position)}
          onResizeItem={(itemId, position) => void updateItemPosition(itemId, position)}
          onPendingChange={(patch) => setPending((prev) => (prev ? { ...prev, ...patch } : prev))}
          onPlacePending={async () => {
            if (!pending) return;
            setSaving(true);
            try {
              const frameSaved = await ensureFrameDraftSaved();
              if (!frameSaved) return;
              const { node } = await createNode(pendingToNodeInput(pending, rackIdParam));
              await loadRack(node.id);
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
            id: n.id,
            name: n.name ?? "",
            hostname: n.hostname ?? "",
            ip_address: n.ip_address ?? "",
          }))}
          onPlaceUnplacedNode={handlePlaceUnplacedNode}
          onUnplaceNode={handleUnplaceNode}
          onSelectedItemChange={(patch) => {
            if (!selectedItem) return;
            setLayoutNodes((prev) =>
              prev.map((item) => (item.id === selectedItem.id ? { ...item, ...patch } : item)),
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
                      await refreshNode(selectedItem.id);
                      await loadRack();
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
                  onClick={() => navigate(`/nodes/${selectedItem.id}`)}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              </>
            ) : null
          }
          onSaveSelected={async () => {
            if (!selectedItem) return;
            const idToKeep = selectedItem.id;
            setSaving(true);
            try {
              const input = layoutNodeToNodeInput(selectedItem, rackIdParam);
              const placement = selectedItem.placement === "rack" ? {
                rack: rackIdParam,
                u_start: selectedItem.position_u_start,
                u_height: selectedItem.position_u_height,
                col_start: selectedItem.position_col_start,
                col_count: selectedItem.position_col_count,
              } : null;
              await updateNode(idToKeep, { ...input, placement });
              await loadRack(idToKeep);
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
              await deleteNode(selectedItem.id);
              await loadRack();
              setSelectedItemId(null);
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
