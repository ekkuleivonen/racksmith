import { useCallback, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { ItemHardwareFields } from "@/components/racks/item-hardware-fields";
import { RackCanvas } from "@/components/racks/rack-canvas";
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
import { Slider } from "@/components/ui/slider";
import {
  type RackLayoutNode,
  type RackWidthInches,
  type ZoneSelection,
} from "@/lib/racks";
import { cn } from "@/lib/utils";

type MovePosition = {
  position_u_start: number;
  position_u_height: number;
  position_col_start: number;
  position_col_count: number;
};

export type PendingNode = RackLayoutNode & { id: string };

type RackBuilderProps = {
  title?: string;
  description?: string;
  showLeftPanel?: boolean;
  showFrameControls?: boolean;
  onActivateFrameEdit?: () => Promise<void> | void;
  frameEditorSlot?: ReactNode;
  rackWidth: RackWidthInches;
  rackUnits: number;
  rackCols: number;
  rackName: string;
  items: RackLayoutNode[];
  selectedItemId: string | null;
  pending: PendingNode | null;
  saving?: boolean;
  actionSlot?: ReactNode;
  selectedItemActionSlot?: ReactNode;
  availableGroups?: Array<{ id: string; name: string }>;
  showSaveSelected?: boolean;
  deleteSelectedLabel?: string;
  onRackWidthChange: (width: RackWidthInches, cols: number) => void;
  onRackUnitsChange: (units: number) => void;
  onRackColsChange: (cols: number) => void;
  onRackNameChange: (name: string) => void;
  onSelectItem: (itemId: string | null) => void;
  onSelectZone: (zone: ZoneSelection) => void;
  onMoveItem: (itemId: string, position: MovePosition) => void;
  onResizeItem: (itemId: string, position: MovePosition) => void;
  onPendingChange: (patch: Partial<PendingNode>) => void;
  onPlacePending: () => Promise<void>;
  onCancelPending: () => void;
  onSelectedItemChange: (patch: Partial<RackLayoutNode>) => void;
  onSaveSelected: () => Promise<void>;
  onDeleteSelected: () => Promise<void>;
  unplacedNodes?: Array<{ id: string; name: string; hostname?: string; ip_address?: string }>;
  onPlaceUnplacedNode?: (nodeId: string, position: MovePosition) => void;
  onUnplaceNode?: (nodeId: string) => void;
};

export function RackBuilder({
  title = "Rack builder",
  description = "Define the rack and place hardware items.",
  showLeftPanel = true,
  showFrameControls = true,
  onActivateFrameEdit,
  frameEditorSlot,
  rackWidth,
  rackUnits,
  rackCols,
  rackName,
  items,
  selectedItemId,
  pending,
  saving = false,
  actionSlot,
  selectedItemActionSlot,
  availableGroups = [],
  showSaveSelected = true,
  deleteSelectedLabel = "Delete",
  onRackWidthChange,
  onRackUnitsChange,
  onRackColsChange,
  onRackNameChange,
  onSelectItem,
  onSelectZone,
  onMoveItem,
  onResizeItem,
  onPendingChange,
  onPlacePending,
  onCancelPending,
  onSelectedItemChange,
  onSaveSelected,
  onDeleteSelected,
  unplacedNodes = [],
  onPlaceUnplacedNode,
  onUnplaceNode,
}: RackBuilderProps) {
  const showFrameEditorInRightPanel = showFrameControls && !!frameEditorSlot;
  const canvasItems = useMemo(
    () => (pending ? [...items, pending] : items),
    [items, pending]
  );

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  const handleUnplacedNodeDragStart = useCallback(
    (event: React.DragEvent, node: { id: string }) => {
      event.dataTransfer.setData(
        "application/x-racksmith-unplaced-node",
        JSON.stringify({ nodeId: node.id })
      );
      event.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const handleUnplaceDrop = useCallback(
    (e: React.DragEvent) => {
      if (!onUnplaceNode) return;
      const raw = e.dataTransfer.getData("application/x-racksmith-item");
      if (!raw) return;
      try {
        const { itemId } = JSON.parse(raw);
        if (itemId) onUnplaceNode(itemId);
      } catch {
        // ignore
      }
    },
    [onUnplaceNode]
  );

  const handleUnplaceDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-racksmith-item")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  const placedItems = useMemo(
    () => items.filter((item) => item.placement === "rack"),
    [items]
  );
  const showUnplaceZone = onUnplaceNode && placedItems.length > 0;

  const [unassignedSearch, setUnassignedSearch] = useState("");
  const [isDraggingOverUnplace, setIsDraggingOverUnplace] = useState(false);

  const handleUnplaceDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-racksmith-item")) {
      setIsDraggingOverUnplace(true);
    }
  }, []);

  const handleUnplaceDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOverUnplace(false);
    }
  }, []);

  const handleUnplaceDropWithReset = useCallback(
    (e: React.DragEvent) => {
      setIsDraggingOverUnplace(false);
      handleUnplaceDrop(e);
    },
    [handleUnplaceDrop]
  );

  const filteredUnplacedNodes = useMemo(() => {
    const q = unassignedSearch.trim().toLowerCase();
    if (!q) return unplacedNodes;
    return unplacedNodes.filter(
      (n) =>
        (n.name ?? "").toLowerCase().includes(q) ||
        (n.ip_address ?? "").toLowerCase().includes(q) ||
        (n.id ?? "").toLowerCase().includes(q)
    );
  }, [unplacedNodes, unassignedSearch]);

  const itemToItemLike = (item: RackLayoutNode | PendingNode) => ({
    managed: item.managed ?? true,
    name: item.name,
    ip_address: item.ip_address ?? "",
    ssh_user: item.ssh_user ?? "",
    ssh_port: item.ssh_port ?? 22,
    labels: item.labels ?? [],
    os_family: item.os_family ?? null,
    mac_address: item.mac_address,
  });

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4">
      <div
        className={cn(
          "max-w-7xl mx-auto grid grid-cols-1 gap-4",
          showLeftPanel ? "xl:grid-cols-[330px_1fr_320px]" : "xl:grid-cols-[1fr_320px]"
        )}
      >
        {showLeftPanel ? (
          <section className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
            <div className="space-y-1">
              <h1 className="text-zinc-100 font-semibold">{title}</h1>
              <p className="text-xs text-zinc-500">{description}</p>
            </div>

            {showFrameControls && !showFrameEditorInRightPanel ? (
              <>
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400">Rack width</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={rackWidth === 19 ? "default" : "outline"}
                      size="sm"
                      onClick={() => onRackWidthChange(19, 12)}
                    >
                      19"
                    </Button>
                    <Button
                      type="button"
                      variant={rackWidth === 10 ? "default" : "outline"}
                      size="sm"
                      onClick={() => onRackWidthChange(10, 6)}
                    >
                      10"
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-zinc-400">Rack units: {rackUnits}U</p>
                  <Slider
                    min={1}
                    max={52}
                    step={1}
                    value={[rackUnits]}
                    onValueChange={([v]) => onRackUnitsChange(v ?? 12)}
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-zinc-400">Columns: {rackCols}</p>
                  <Slider
                    min={2}
                    max={48}
                    step={1}
                    value={[rackCols]}
                    onValueChange={([v]) => onRackColsChange(v ?? 12)}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-3 border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{rackWidth}"</Badge>
                  <Badge variant="outline">{rackUnits}U</Badge>
                  <Badge variant="outline">{rackCols} cols</Badge>
                </div>
                <p className="text-xs text-zinc-500">
                  {showFrameEditorInRightPanel
                    ? "Rack frame editing is active in the right panel."
                    : "Rack frame changes are hidden by default for existing racks."}
                </p>
                {onActivateFrameEdit && !showFrameEditorInRightPanel ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void onActivateFrameEdit()}
                  >
                    Change rack frame
                  </Button>
                ) : null}
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs text-zinc-400">Rack name</p>
              <Input
                value={rackName}
                onChange={(event) => onRackNameChange(event.target.value)}
                placeholder="Office rack"
              />
            </div>

            {actionSlot ? (
              <div className="border-t border-zinc-800 pt-3 flex flex-wrap gap-2">{actionSlot}</div>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-3">
          <RackCanvas
            rackUnits={rackUnits}
            cols={rackCols}
            items={canvasItems}
            selectedItemId={selectedItemId}
            pendingItemId={pending?.id ?? null}
            onSelectItem={onSelectItem}
            onSelectZone={onSelectZone}
            onMoveItem={onMoveItem}
            onResizeItem={onResizeItem}
            onPlaceUnplacedNode={onPlaceUnplacedNode}
            selectionMode
          />
          <p className="text-xs text-zinc-400">
            Drag to select a zone. Drag from center to move, from edges to resize. {rackWidth}" rack:{" "}
            {rackCols} cols × {rackUnits}U.
          </p>
        </section>

        <div className="flex flex-col gap-4 min-w-0">
          <section className="space-y-3 border border-zinc-800 bg-zinc-900/30 p-4 flex-1 min-h-0">
            <h2 className="text-zinc-100 text-sm font-semibold">
              {showFrameEditorInRightPanel ? "Rack frame" : "Selected item"}
            </h2>
          {showFrameEditorInRightPanel ? (
            frameEditorSlot
          ) : pending ? (
            <>
              <div className="space-y-1">
                <p className="text-sm text-zinc-100">
                  {pending.name || pending.ip_address || "Pending details"}
                </p>
                <p className="text-xs text-zinc-400">
                  {pending.position_u_height}U × {pending.position_col_count} col
                  {pending.position_col_count > 1 ? "s" : ""}
                </p>
              </div>
              <p className="text-xs text-zinc-400">
                Place the item now. Add IP address whenever you are ready.
              </p>
              <Separator />
              <ItemHardwareFields
                item={itemToItemLike(pending)}
                onChange={(patch) =>
                  onPendingChange({
                    ...patch,
                    labels: patch.labels ?? pending.labels ?? [],
                  })
                }
              />
              {pending.os_family && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{pending.os_family}</Badge>
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={saving} onClick={() => void onPlacePending()}>
                  Place item
                </Button>
                <Button size="sm" variant="outline" onClick={onCancelPending}>
                  Cancel
                </Button>
              </div>
            </>
          ) : !selectedItem ? (
            <p className="text-xs text-zinc-500">Select a zone on the rack or click an item to edit.</p>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-sm text-zinc-100">
                  {selectedItem.name || selectedItem.ip_address || "Unassigned"}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {selectedItem.position_u_height}U × {selectedItem.position_col_count} col
                  {selectedItem.position_col_count > 1 ? "s" : ""}
                </p>
              </div>
              {(selectedItem.os_family ?? (selectedItem as { os?: string }).os) && (
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline">
                    {(selectedItem as { os?: string }).os ?? selectedItem.os_family ?? ""}
                  </Badge>
                </div>
              )}
              <Separator />
              <ItemHardwareFields
                item={itemToItemLike(selectedItem)}
                onChange={(patch) =>
                  onSelectedItemChange({
                    ...patch,
                    labels: patch.labels ?? selectedItem.labels ?? [],
                  })
                }
              />
              {availableGroups.length > 0 ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
                      Groups
                    </p>
                    <div className="flex flex-wrap gap-1 min-h-[24px]">
                      {(selectedItem.groups ?? []).map((gid) => {
                        const g = availableGroups.find((x) => x.id === gid);
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
                                onSelectedItemChange({
                                  groups: (selectedItem.groups ?? []).filter(
                                    (id) => id !== gid,
                                  ),
                                })
                              }
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (
                          value &&
                          !(selectedItem.groups ?? []).includes(value)
                        ) {
                          onSelectedItemChange({
                            groups: [...(selectedItem.groups ?? []), value],
                          });
                        }
                      }}
                    >
                      <SelectTrigger size="sm" className="h-8 text-xs w-[180px]">
                        <SelectValue placeholder="Add group" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableGroups
                          .filter(
                            (g) => !(selectedItem.groups ?? []).includes(g.id),
                          )
                          .map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name || g.id}
                            </SelectItem>
                          ))}
                        {availableGroups.filter(
                          (g) => !(selectedItem.groups ?? []).includes(g.id),
                        ).length === 0 ? (
                          <div className="px-2 py-4 text-xs text-zinc-500">
                            No more groups to add
                          </div>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {showSaveSelected ? (
                  <Button size="sm" disabled={saving} onClick={() => void onSaveSelected()}>
                    Save item
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => void onDeleteSelected()}
                >
                  {deleteSelectedLabel}
                </Button>
                {selectedItemActionSlot ? (
                  <div className="ml-auto flex items-center gap-2">
                    {selectedItemActionSlot}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>

          {(unplacedNodes.length > 0 || showUnplaceZone) ? (
            <div
              className={cn(
                "border p-3 flex flex-col min-h-0 transition-colors",
                showUnplaceZone && isDraggingOverUnplace
                  ? "border-2 border-dashed border-zinc-400/80 bg-zinc-500/20"
                  : "border border-zinc-800 bg-zinc-900/30"
              )}
              onDragEnter={showUnplaceZone ? handleUnplaceDragEnter : undefined}
              onDragLeave={showUnplaceZone ? handleUnplaceDragLeave : undefined}
              onDragOver={showUnplaceZone ? handleUnplaceDragOver : undefined}
              onDrop={showUnplaceZone ? handleUnplaceDropWithReset : undefined}
            >
              <h3 className="text-sm text-zinc-100 font-semibold shrink-0">Unassigned nodes</h3>
              <p className="text-xs text-zinc-500 shrink-0">
                Drag onto the rack to place. Drop here to unplace.
              </p>
              {unplacedNodes.length > 0 ? (
                <>
                  <Input
                    placeholder="Search..."
                    value={unassignedSearch}
                    onChange={(e) => setUnassignedSearch(e.target.value)}
                    className="mt-2 h-8 text-xs"
                  />
                  <div className="mt-2 flex flex-col gap-1 overflow-y-auto min-h-0 max-h-80 flex-1">
                    {filteredUnplacedNodes.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        draggable
                        onDragStart={(e) => handleUnplacedNodeDragStart(e, node)}
                        className="border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-left hover:border-zinc-700 cursor-grab active:cursor-grabbing text-xs truncate"
                      >
                        {node.name || node.hostname || node.ip_address || node.id}
                      </button>
                    ))}
                    {filteredUnplacedNodes.length === 0 && unassignedSearch.trim() ? (
                      <p className="text-xs text-zinc-500 py-2">No matches</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-xs text-zinc-500 mt-2">Drop nodes here to unplace.</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
