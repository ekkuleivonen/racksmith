import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ItemHardwareFields } from "@/components/racks/item-hardware-fields";
import { RackCanvas } from "@/components/racks/rack-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  createRack as createRackRequest,
  previewRackItem,
  type RackItem,
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
  items: RackItem[];
  selectedItemId: string | null;
  pending: RackItem | null;
  saving?: boolean;
  actionSlot?: ReactNode;
  selectedItemActionSlot?: ReactNode;
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
  onPendingChange: (patch: Partial<RackItem>) => void;
  onPlacePending: () => Promise<void>;
  onCancelPending: () => void;
  onSelectedItemChange: (patch: Partial<RackItem>) => void;
  onSaveSelected: () => Promise<void>;
  onDeleteSelected: () => Promise<void>;
};

type CreateRackBuilderProps = {
  onCreated?: (rackId: string) => void;
  title?: string;
  description?: string;
  createLabel?: string;
};

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
}: RackBuilderProps) {
  const showFrameEditorInRightPanel = showFrameControls && !!frameEditorSlot;
  const parkedItems = useMemo(
    () => items.filter((item) => item.placement === "parked"),
    [items]
  );
  const canvasItems = useMemo(
    () => (pending ? [...items, pending] : items),
    [items, pending]
  );

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  const handleParkedItemDragStart = useCallback(
    (event: React.DragEvent, item: RackItem) => {
      event.dataTransfer.setData(
        "application/x-racksmith-item",
        JSON.stringify({
          itemId: item.id,
          position_u_height: item.position_u_height,
          position_col_count: item.position_col_count,
        })
      );
      event.dataTransfer.effectAllowed = "move";
    },
    []
  );

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
          <p className="text-xs text-zinc-400">
            Drag to select a zone. Drag from center to move, from edges to resize. {rackWidth}" rack:{" "}
            {rackCols} cols × {rackUnits}U.
          </p>
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
            selectionMode
          />
          {parkedItems.length > 0 ? (
            <section className="space-y-2 border border-zinc-800 bg-zinc-900/30 p-3">
              <div className="space-y-1">
                <h3 className="text-sm text-zinc-100 font-semibold">Parked items</h3>
                <p className="text-xs text-zinc-500">
                  Drag parked items back into the rack when you are ready to place them.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {parkedItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    draggable
                    onDragStart={(event) => handleParkedItemDragStart(event, item)}
                    onClick={() => onSelectItem(item.id)}
                    className="border border-zinc-800 bg-zinc-950/60 p-3 text-left hover:border-zinc-700"
                  >
                    <p className="text-sm text-zinc-100 truncate">
                      {item.name || item.host || item.id}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Parked · {item.position_u_height}U × {item.position_col_count} col
                      {item.position_col_count > 1 ? "s" : ""}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <section className="space-y-3 border border-zinc-800 bg-zinc-900/30 p-4">
          <h2 className="text-zinc-100 text-sm font-semibold">
            {showFrameEditorInRightPanel ? "Rack frame" : "Selected item"}
          </h2>
          {showFrameEditorInRightPanel ? (
            frameEditorSlot
          ) : pending ? (
            <>
              <div className="space-y-1">
                <p className="text-sm text-zinc-100">
                  {pending.name || pending.host || "Pending details"}
                </p>
                <p className="text-xs text-zinc-400">
                  {pending.position_u_height}U × {pending.position_col_count} col
                  {pending.position_col_count > 1 ? "s" : ""}
                </p>
              </div>
              <p className="text-xs text-zinc-400">
                Place the item now. Add host details whenever you are ready.
              </p>
              <Separator />
              <ItemHardwareFields item={pending} onChange={onPendingChange} />
              {(pending.os || pending.mac_address) && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {pending.os && <Badge variant="outline">{pending.os}</Badge>}
                    </div>
                    <div className="space-y-1 text-xs text-zinc-400">
                      <p>Host: {pending.host || "Not set"}</p>
                      <p>User: {pending.ssh_user || "Not set"}</p>
                      <p>Port: {pending.ssh_port}</p>
                      <p>MAC: {pending.mac_address || "Not discovered"}</p>
                    </div>
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
                  {selectedItem.name || selectedItem.host || "Unassigned"}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {selectedItem.placement === "parked"
                    ? `Parked · ${selectedItem.position_u_height}U × ${selectedItem.position_col_count} col${
                        selectedItem.position_col_count > 1 ? "s" : ""
                      }`
                    : `${selectedItem.position_u_height}U × ${selectedItem.position_col_count} col${
                        selectedItem.position_col_count > 1 ? "s" : ""
                      }`}
                </p>
              </div>
              {selectedItem.os && (
                <div className="flex flex-wrap gap-1">
                  {selectedItem.os && <Badge variant="outline">{selectedItem.os}</Badge>}
                </div>
              )}
              <Separator />
              <ItemHardwareFields item={selectedItem} onChange={onSelectedItemChange} />
              <div className="space-y-1 text-xs text-zinc-400">
                <p>Host: {selectedItem.host || "Not set"}</p>
                <p>User: {selectedItem.ssh_user || "Not set"}</p>
                <p>Port: {selectedItem.ssh_port}</p>
                <p>MAC: {selectedItem.mac_address || "Not discovered"}</p>
              </div>
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
      </div>
    </div>
  );
}

export function CreateRackBuilder({
  onCreated,
  title = "Create your rack",
  description = "Define a rack and place the hardware that belongs to it.",
  createLabel = "Create rack",
}: CreateRackBuilderProps) {
  const [rackWidth, setRackWidth] = useState<RackWidthInches>(19);
  const [rackUnits, setRackUnits] = useState(12);
  const [rackCols, setRackCols] = useState(12);
  const [rackName, setRackName] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [items, setItems] = useState<RackItem[]>([]);
  const [pending, setPending] = useState<RackItem | null>(null);
  const [saving, setSaving] = useState(false);

  const onSelectZone = useCallback((zone: ZoneSelection) => {
    const bottomU = zone.startU - zone.heightU + 1;
    if (bottomU < 1) {
      toast.error("Selection does not fit rack height");
      return;
    }
    setPending(makePendingItem(zone));
  }, []);

  const createRack = useCallback(async () => {
    const trimmedRackName = rackName.trim();
    if (!trimmedRackName) {
      toast.error("Rack name is required");
      return;
    }
    if (items.length === 0) {
      toast.error("Place at least one item on the rack");
      return;
    }

    setSaving(true);
    try {
      const created = await createRackRequest({
        name: trimmedRackName,
        rack_width_inches: rackWidth,
        rack_units: rackUnits,
        rack_cols: rackCols,
        items,
      });
      toast.success("Rack created");
      onCreated?.(created.rack_id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create rack");
    } finally {
      setSaving(false);
    }
  }, [items, onCreated, rackCols, rackName, rackUnits, rackWidth]);

  return (
    <RackBuilder
      title={title}
      description={description}
      rackWidth={rackWidth}
      rackUnits={rackUnits}
      rackCols={rackCols}
      rackName={rackName}
      items={items}
      selectedItemId={selectedItemId}
      pending={pending}
      saving={saving}
      deleteSelectedLabel="Remove item"
      actionSlot={
        <Button type="button" size="sm" onClick={() => void createRack()} disabled={saving}>
          {saving ? "Creating rack..." : createLabel}
        </Button>
      }
      onRackWidthChange={(width, cols) => {
        setRackWidth(width);
        setRackCols(cols);
      }}
      onRackUnitsChange={setRackUnits}
      onRackColsChange={setRackCols}
      onRackNameChange={setRackName}
      onSelectItem={setSelectedItemId}
      onSelectZone={onSelectZone}
      onMoveItem={(itemId, position) => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, ...position, placement: "rack" } : item
          )
        );
      }}
      onResizeItem={(itemId, position) => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, ...position, placement: "rack" } : item
          )
        );
      }}
      onPendingChange={(patch) => setPending((prev) => (prev ? { ...prev, ...patch } : prev))}
      onPlacePending={async () => {
        if (!pending) return;
        setItems((prev) => [...prev, pending]);
        setSelectedItemId(pending.id);
        setPending(null);
      }}
      onCancelPending={() => setPending(null)}
      onSelectedItemChange={(patch) =>
        setItems((prev) =>
          prev.map((item) => (item.id === selectedItemId ? { ...item, ...patch } : item))
        )
      }
      onSaveSelected={async () => {
        const selectedItem = items.find((item) => item.id === selectedItemId);
        if (!selectedItem) return;
        setSaving(true);
        try {
          const result = await previewRackItem({
            ...selectedItem,
            rack_units: rackUnits,
            rack_cols: rackCols,
          });
          setItems((prev) =>
            prev.map((item) => (item.id === selectedItem.id ? result.item : item))
          );
          toast.success("Item discovered");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to validate item");
        } finally {
          setSaving(false);
        }
      }}
      onDeleteSelected={async () => {
        if (!selectedItemId) return;
        setItems((prev) => prev.filter((item) => item.id !== selectedItemId));
        setSelectedItemId(null);
      }}
    />
  );
}

export function RackOnboardingPage() {
  const navigate = useNavigate();

  return <CreateRackBuilder onCreated={(rackId) => navigate(`/rack/view/${rackId}`)} />;
}
