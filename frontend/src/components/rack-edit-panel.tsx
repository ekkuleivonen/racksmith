import { ItemHardwareFields } from "@/components/item-hardware-fields";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { RackItem } from "@/lib/racks";

interface RackEditPanelProps {
  pending: RackItem | null;
  selectedItem: RackItem | null;
  saving: boolean;
  onPendingChange: (patch: Partial<RackItem>) => void;
  onPlacePending: () => Promise<void>;
  onCancelPending: () => void;
  onSelectedItemChange: (patch: Partial<RackItem>) => void;
  onSaveSelected: () => Promise<void>;
  onDeleteSelected: () => Promise<void>;
}

export function RackEditPanel({
  pending,
  selectedItem,
  saving,
  onPendingChange,
  onPlacePending,
  onCancelPending,
  onSelectedItemChange,
  onSaveSelected,
  onDeleteSelected,
}: RackEditPanelProps) {
  return (
    <section className="space-y-3 border border-zinc-800 bg-zinc-900/30 p-4">
      {pending && (
        <div className="space-y-2">
          <h3 className="text-xs text-zinc-300">Place new hardware</h3>
          <p className="text-[11px] text-zinc-500">
            {pending.position_u_height}U &times; {pending.position_col_count} col
            {pending.position_col_count > 1 ? "s" : ""}
          </p>
          <p className="text-[11px] text-zinc-500">
            Place the item now. Add host details whenever you are ready.
          </p>
          <Separator />
          <ItemHardwareFields item={pending} onChange={onPendingChange} />
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={() => void onPlacePending()}>
              Place item
            </Button>
            <Button size="sm" variant="outline" onClick={onCancelPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className={`${pending ? "border-t border-zinc-800 pt-3" : ""} space-y-2`}>
        <h2 className="text-sm text-zinc-100 font-semibold">Selected item</h2>
        {!selectedItem ? (
          <p className="text-xs text-zinc-500">Select a placed item to edit.</p>
        ) : (
          <>
            <p className="text-[11px] text-zinc-500">
              {selectedItem.position_u_height}U &times; {selectedItem.position_col_count} col
              {selectedItem.position_col_count > 1 ? "s" : ""}
            </p>
            <Separator />
            <ItemHardwareFields item={selectedItem} onChange={onSelectedItemChange} />
            <div className="flex gap-2">
              <Button size="sm" disabled={saving} onClick={() => void onSaveSelected()}>
                Save item
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void onDeleteSelected()}
              >
                Delete
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
