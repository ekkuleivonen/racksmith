import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { createRack, type RackWidthInches } from "@/lib/racks";

type RackOnboardingPageProps = {
  onCreated?: (rackSlug: string) => void;
};

export function RackOnboardingPage({ onCreated }: RackOnboardingPageProps) {
  const navigate = useNavigate();
  const [rackWidth, setRackWidth] = useState<RackWidthInches>(19);
  const [rackUnits, setRackUnits] = useState(12);
  const [rackCols, setRackCols] = useState(12);
  const [rackName, setRackName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const trimmedRackName = rackName.trim();
    if (!trimmedRackName) {
      toast.error("Rack name is required");
      return;
    }

    setSaving(true);
    try {
      const result = await createRack({
        name: trimmedRackName,
        rack_width_inches: rackWidth,
        rack_units: rackUnits,
        rack_cols: rackCols,
      });
      toast.success("Rack created");
      if (onCreated) {
        onCreated(result.rack_slug);
      } else {
        navigate(`/rack/view/${result.rack_slug}`, { replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create rack");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4">
      <div className="max-w-xl mx-auto space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="space-y-1">
          <h1 className="text-zinc-100 font-semibold">Create your rack</h1>
          <p className="text-xs text-zinc-500">
            Define a rack. Add hardware items after creation.
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-zinc-400">Rack name</p>
          <Input
            value={rackName}
            onChange={(e) => setRackName(e.target.value)}
            placeholder="Office rack"
          />
        </div>

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

        <Button
          type="button"
          size="sm"
          onClick={() => void handleCreate()}
          disabled={saving}
        >
          {saving ? "Creating rack..." : "Create rack"}
        </Button>
      </div>
    </div>
  );
}
