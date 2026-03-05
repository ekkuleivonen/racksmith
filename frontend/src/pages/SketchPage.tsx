import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { ServerRack, type RackWidth } from "@/components/server-rack";
import { Button } from "@/components/ui/button";

const MIN_UNITS = 1;
const MAX_UNITS = 48;

export function SketchPage() {
  const [units, setUnits] = useState(8);
  const [rackWidth, setRackWidth] = useState<RackWidth>(19);

  return (
    <div className="flex-1 min-h-screen flex flex-col items-center justify-center gap-8 relative overflow-hidden sketch-paper">
      <h1 className="text-2xl font-medium text-zinc-700 dark:text-foreground relative z-10">
        hello world
      </h1>

      <div className="flex flex-col items-center gap-6 relative z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setUnits((u) => Math.max(MIN_UNITS, u - 1))}
              disabled={units <= MIN_UNITS}
              aria-label="Remove unit"
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="text-sm text-zinc-600 dark:text-muted-foreground tabular-nums min-w-[3ch] text-center">
              {units}U
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setUnits((u) => Math.min(MAX_UNITS, u + 1))}
              disabled={units >= MAX_UNITS}
              aria-label="Add unit"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex gap-0.5">
            <Button
              variant={rackWidth === 19 ? "default" : "outline"}
              size="xs"
              onClick={() => setRackWidth(19)}
            >
              19"
            </Button>
            <Button
              variant={rackWidth === 10 ? "default" : "outline"}
              size="xs"
              onClick={() => setRackWidth(10)}
            >
              10"
            </Button>
          </div>
        </div>
        <ServerRack
          units={units}
          rackWidth={rackWidth}
          className="w-64 h-auto text-zinc-600 dark:text-muted-foreground"
        />
      </div>
    </div>
  );
}
