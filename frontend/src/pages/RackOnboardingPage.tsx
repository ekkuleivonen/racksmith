import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RackCanvas } from "@/components/rack-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { apiPost } from "@/lib/api";
import type { RackItem, RackWidthInches, ZoneSelection } from "@/lib/racks";

type DraftItem = RackItem;

function makeItemId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function RackOnboardingPage() {
  const navigate = useNavigate();
  const [rackWidth, setRackWidth] = useState<RackWidthInches>(19);
  const [rackUnits, setRackUnits] = useState(12);
  const [rackCols, setRackCols] = useState(12);
  const [rackName, setRackName] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const selectionMode = true;

  const selectedDraft = useMemo(
    () => draftItems.find((item) => item.id === selectedDraftId) ?? null,
    [draftItems, selectedDraftId]
  );

  const onSelectZone = useCallback(
    (zone: ZoneSelection) => {
      const bottomU = zone.startU - zone.heightU + 1;
      if (bottomU < 1) {
        toast.error("Selection does not fit rack height");
        return;
      }
      const newId = makeItemId();
      setDraftItems((prev) => [
        ...prev,
        {
          id: newId,
          position_u_start: bottomU,
          position_u_height: zone.heightU,
          position_col_start: zone.startCol,
          position_col_count: zone.colCount,
          has_no_ip: false,
          ip_address: "",
          name: null,
        },
      ]);
      setSelectedDraftId(newId);
    },
    []
  );

  const updateItemPosition = useCallback(
    (
      itemId: string,
      position: {
        position_u_start: number;
        position_u_height: number;
        position_col_start: number;
        position_col_count: number;
      }
    ) => {
      setDraftItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, ...position } : item))
      );
    },
    []
  );

  const updateSelectedDraft = useCallback(
    (patch: Partial<DraftItem>) => {
      setDraftItems((prev) =>
        prev.map((item) => (item.id === selectedDraftId ? { ...item, ...patch } : item))
      );
    },
    [selectedDraftId]
  );

  const completeOnboarding = useCallback(async () => {
    const trimmedRackName = rackName.trim();
    if (!trimmedRackName) {
      toast.error("Rack name is required");
      return;
    }
    if (draftItems.length === 0) {
      toast.error("Select at least one zone on the rack");
      return;
    }
    if (
      draftItems.some((item) => {
        if (item.has_no_ip) return false;
        return !(item.ip_address && item.ip_address.trim());
      })
    ) {
      toast.error("Each networked item needs an IP, or mark it as 'has no IP'");
      return;
    }

    setSaving(true);
    try {
      const created = await apiPost<{ rack_id: string }>("/racks", {
        name: trimmedRackName,
        rack_width_inches: rackWidth,
        rack_units: rackUnits,
        rack_cols: rackCols,
        items: draftItems.map((item) => ({
          ...item,
          ip_address: item.has_no_ip ? null : item.ip_address,
        })),
      });
      toast.success("Rack repository created");
      navigate(`/racks/${created.rack_id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create rack repository");
    } finally {
      setSaving(false);
    }
  }, [draftItems, navigate, rackName, rackUnits, rackWidth, rackCols]);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4">
      <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[330px_1fr_320px] gap-4">
        <section className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
          <h1 className="text-zinc-100 font-semibold">Rack onboarding</h1>
          <p className="text-xs text-zinc-500">
            This creates a GitHub repo for the rack and stores state in `.racksmith/rack.json`.
          </p>

          <div className="space-y-2">
            <p className="text-xs text-zinc-400">Rack width</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={rackWidth === 19 ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setRackWidth(19);
                  setRackCols(12);
                }}
              >
                19"
              </Button>
              <Button
                type="button"
                variant={rackWidth === 10 ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setRackWidth(10);
                  setRackCols(6);
                }}
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
              onValueChange={([v]) => setRackUnits(v ?? 12)}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs text-zinc-400">Columns: {rackCols}</p>
            <Slider
              min={2}
              max={48}
              step={1}
              value={[rackCols]}
              onValueChange={([v]) => setRackCols(v ?? 12)}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs text-zinc-400">Rack name</p>
            <Input
              value={rackName}
              onChange={(event) => setRackName(event.target.value)}
              placeholder="Office rack"
            />
          </div>

          <div className="border-t border-zinc-800 pt-3">
            <Button type="button" size="sm" onClick={() => void completeOnboarding()} disabled={saving}>
              {saving ? "Creating repo..." : "Finish onboarding"}
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-xs text-zinc-400">
            Drag to select a zone. Drag from center to move, from edges to resize. {rackWidth}" rack: {rackCols} cols × {rackUnits}U.
          </p>
          <RackCanvas
            rackUnits={rackUnits}
            cols={rackCols}
            items={draftItems}
            selectedItemId={selectedDraftId}
            onSelectItem={setSelectedDraftId}
            onSelectZone={onSelectZone}
            onMoveItem={updateItemPosition}
            onResizeItem={updateItemPosition}
            selectionMode={selectionMode}
          />
        </section>

        <section className="space-y-3 border border-zinc-800 bg-zinc-900/30 p-4">
          <h2 className="text-zinc-100 text-sm font-semibold">Selected item</h2>
          {!selectedDraft ? (
            <p className="text-xs text-zinc-500">Select a zone on the rack or click an item to edit.</p>
          ) : (
            <>
              <p className="text-xs text-zinc-400">
                {selectedDraft.position_u_height}U × {selectedDraft.position_col_count} col
                {selectedDraft.position_col_count > 1 ? "s" : ""}
              </p>
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={selectedDraft.has_no_ip}
                  onChange={(event) =>
                    updateSelectedDraft({
                      has_no_ip: event.target.checked,
                      ip_address: event.target.checked ? null : "",
                    })
                  }
                />
                Has no IP
              </label>
              {!selectedDraft.has_no_ip && (
                <Input
                  value={selectedDraft.ip_address ?? ""}
                  onChange={(event) => updateSelectedDraft({ ip_address: event.target.value })}
                  placeholder="IP address"
                />
              )}
              <Input
                value={selectedDraft.name || ""}
                onChange={(event) => updateSelectedDraft({ name: event.target.value || null })}
                placeholder="Name (optional)"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraftItems((prev) => prev.filter((item) => item.id !== selectedDraft.id));
                  setSelectedDraftId(null);
                }}
              >
                Remove item
              </Button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
