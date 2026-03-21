import { useCallback, useMemo, useState, type ReactNode } from "react";
import { RackCanvas } from "@/components/racks/rack-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  type RackLayoutHost,
  type RackWidthInches,
  type ZoneSelection,
} from "@/lib/racks";
import { hostDisplayLabel } from "@/lib/hosts";
import { cn } from "@/lib/utils";

type MovePosition = {
  position_u_start: number;
  position_u_height: number;
  position_col_start: number;
  position_col_count: number;
};

export type PendingHost = RackLayoutHost & { id: string };

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
  items: RackLayoutHost[];
  selectedItemId: string | null;
  pending: PendingHost | null;
  saving?: boolean;
  actionSlot?: ReactNode;
  onRackWidthChange: (width: RackWidthInches, cols: number) => void;
  onRackUnitsChange: (units: number) => void;
  onRackColsChange: (cols: number) => void;
  onRackNameChange: (name: string) => void;
  onSelectItem: (itemId: string | null) => void;
  onSelectZone: (zone: ZoneSelection) => void;
  onMoveItem: (itemId: string, position: MovePosition) => void;
  onResizeItem: (itemId: string, position: MovePosition) => void;
  onPendingChange: (patch: Partial<PendingHost>) => void;
  onPlacePending: () => Promise<void>;
  onCancelPending: () => void;
  unplacedHosts?: Array<{ id: string; name: string; hostname?: string; ip_address?: string }>;
  onPlaceUnplacedHost?: (hostId: string, position: MovePosition) => void;
  onUnplaceHost?: (hostId: string) => void;
  onDeleteItem?: (itemId: string) => void;
  onUpdateItemName?: (itemId: string, name: string) => void;
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
  unplacedHosts = [],
  onPlaceUnplacedHost,
  onUnplaceHost,
  onDeleteItem,
  onUpdateItemName,
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

  const handleUnplacedHostDragStart = useCallback(
    (event: React.DragEvent, host: { id: string }) => {
      event.dataTransfer.setData(
        "application/x-racksmith-unplaced-host",
        JSON.stringify({ hostId: host.id })
      );
      event.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const handleUnplaceDrop = useCallback(
    (e: React.DragEvent) => {
      if (!onUnplaceHost) return;
      const raw = e.dataTransfer.getData("application/x-racksmith-item");
      if (!raw) return;
      try {
        const { itemId } = JSON.parse(raw);
        if (itemId) onUnplaceHost(itemId);
      } catch {
        // ignore
      }
    },
    [onUnplaceHost]
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
  const showUnplaceZone = onUnplaceHost && placedItems.length > 0;

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

  const filteredUnplacedHosts = useMemo(() => {
    const q = unassignedSearch.trim().toLowerCase();
    if (!q) return unplacedHosts;
    return unplacedHosts.filter(
      (h) =>
        (h.name ?? "").toLowerCase().includes(q) ||
        (h.ip_address ?? "").toLowerCase().includes(q) ||
        (h.id ?? "").toLowerCase().includes(q)
    );
  }, [unplacedHosts, unassignedSearch]);

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
            onPlaceUnplacedHost={onPlaceUnplacedHost}
            selectionMode
          />
          <p className="text-xs text-zinc-400">
            Select a zone to place non-host items. Drag hosts from the unassigned list. Drag to move, edges to resize.
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
                <p className="text-xs text-zinc-400">
                  {pending.position_u_height}U × {pending.position_col_count} col
                  {pending.position_col_count > 1 ? "s" : ""}
                </p>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
                  Visual element
                </p>
                <Input
                  className="h-8 text-xs"
                  value={pending.name ?? ""}
                  onChange={(e) => onPendingChange({ name: e.target.value })}
                  placeholder="e.g. Patch panel, PDU, shelf"
                />
              </div>
              <p className="text-xs text-zinc-500">
                Add a visual-only rack element. It won't appear in SSH, sidebar, or device pages.
              </p>
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
            <p className="text-xs text-zinc-500">Select a zone on the rack or click an item.</p>
          ) : !selectedItem.managed ? (
            <UnmanagedItemPanel
              key={selectedItem.id}
              item={selectedItem}
              saving={saving}
              onUpdateName={onUpdateItemName ? (name) => onUpdateItemName(selectedItem.id, name) : undefined}
              onDelete={onDeleteItem ? () => onDeleteItem(selectedItem.id) : undefined}
            />
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-sm text-zinc-100">
                  {selectedItem.name || selectedItem.ip_address || "Unassigned"}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {selectedItem.position_u_height}U × {selectedItem.position_col_count} col
                  {selectedItem.position_col_count > 1 ? "s" : ""} · Row {selectedItem.position_u_start}
                </p>
              </div>
              {(selectedItem.os_family ?? (selectedItem as { os?: string }).os) && (
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline">
                    {(selectedItem as { os?: string }).os ?? selectedItem.os_family ?? ""}
                  </Badge>
                </div>
              )}
              {selectedItem.ip_address && (
                <p className="text-xs text-zinc-400">{selectedItem.ip_address}</p>
              )}
            </>
          )}
        </section>

          {(unplacedHosts.length > 0 || showUnplaceZone) ? (
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
              <h3 className="text-sm text-zinc-100 font-semibold shrink-0">Unassigned hosts</h3>
              <p className="text-xs text-zinc-500 shrink-0">
                Drag onto the rack to place. Drop here to unplace.
              </p>
              {unplacedHosts.length > 0 ? (
                <>
                  <Input
                    placeholder="Search..."
                    value={unassignedSearch}
                    onChange={(e) => setUnassignedSearch(e.target.value)}
                    className="mt-2 h-8 text-xs"
                  />
                  <div className="mt-2 flex flex-col gap-1.5 overflow-y-auto min-h-0 max-h-[340px] flex-1">
                    {filteredUnplacedHosts.map((host) => (
                      <button
                        key={host.id}
                        type="button"
                        draggable
                        onDragStart={(e) => handleUnplacedHostDragStart(e, host)}
                        className="shrink-0 border border-zinc-700/60 bg-zinc-900/80 px-2.5 py-2 text-left hover:border-zinc-600 hover:bg-zinc-800/60 cursor-grab active:cursor-grabbing text-xs truncate transition-colors"
                      >
                        {hostDisplayLabel(host)}
                      </button>
                    ))}
                    {filteredUnplacedHosts.length === 0 && unassignedSearch.trim() ? (
                      <p className="text-xs text-zinc-500 py-2">No matches</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-xs text-zinc-500 mt-2">Drop hosts here to unplace.</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UnmanagedItemPanel({
  item,
  saving,
  onUpdateName,
  onDelete,
}: {
  item: RackLayoutHost;
  saving: boolean;
  onUpdateName?: (name: string) => void;
  onDelete?: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(item.name ?? "");

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed !== (item.name ?? "") && onUpdateName) {
      onUpdateName(trimmed);
    }
  };

  return (
    <>
      <div className="space-y-1">
        <Badge variant="outline" className="text-[10px]">Visual element</Badge>
        <p className="text-[11px] text-zinc-500">
          {item.position_u_height}U × {item.position_col_count} col
          {item.position_col_count > 1 ? "s" : ""} · Row {item.position_u_start}
        </p>
      </div>
      <Separator />
      {onUpdateName ? (
        <div className="space-y-1">
          <p className="text-xs text-zinc-400">Name</p>
          <Input
            className="h-8 text-xs"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
            }}
            placeholder="e.g. Patch panel, PDU, shelf"
          />
        </div>
      ) : (
        <p className="text-sm text-zinc-100">{item.name || "Unnamed element"}</p>
      )}
      {onDelete ? (
        <Button size="sm" variant="outline" disabled={saving} onClick={onDelete}>
          Remove from rack
        </Button>
      ) : null}
    </>
  );
}
