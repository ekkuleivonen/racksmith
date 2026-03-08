import { ItemHardwareFields } from "./item-hardware-fields";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { RackLayoutNode } from "@/lib/racks";

function toItemLike(item: RackLayoutNode) {
  return {
    managed: item.managed ?? true,
    name: item.name,
    ip_address: item.ip_address ?? "",
    ssh_user: item.ssh_user ?? "",
    ssh_port: item.ssh_port ?? 22,
    labels: item.labels ?? [],
    os_family: item.os_family ?? null,
    mac_address: item.mac_address,
  };
}

interface RackEditPanelProps {
  pending: RackLayoutNode | null;
  selectedItem: RackLayoutNode | null;
  saving: boolean;
  onPendingChange: (patch: Partial<RackLayoutNode>) => void;
  onPlacePending: () => Promise<void>;
  onCancelPending: () => void;
  onSelectedItemChange: (patch: Partial<RackLayoutNode>) => void;
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
            Place the item now. Add IP address whenever you are ready.
          </p>
          <Separator />
          <ItemHardwareFields item={toItemLike(pending)} onChange={onPendingChange} />
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
            <ItemHardwareFields item={toItemLike(selectedItem)} onChange={onSelectedItemChange} />
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
