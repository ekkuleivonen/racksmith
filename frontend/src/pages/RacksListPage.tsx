import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import type { RackSummary } from "@/lib/racks";

export function RacksListPage() {
  const [racks, setRacks] = useState<RackSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiGet<{ racks: RackSummary[] }>("/racks");
        if (!active) return;
        setRacks(data.racks);
      } catch (error) {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Failed to load racks");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-zinc-100 text-lg font-semibold">Your racks</h1>
          <Link to="/racks/new">
            <Button size="sm">Create rack</Button>
          </Link>
        </div>

        {loading ? (
          <p className="text-zinc-500 text-sm">Loading racks...</p>
        ) : racks.length === 0 ? (
          <div className="border border-zinc-800 bg-zinc-900/30 p-6">
            <p className="text-zinc-400 text-sm">No racks yet.</p>
            <p className="text-zinc-500 text-xs mt-1">Start onboarding to create your first rack.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {racks.map((rack) => (
              <Link
                key={rack.id}
                to={`/racks/${rack.id}`}
                className="border border-zinc-800 bg-zinc-900/30 p-4 hover:bg-zinc-900/60 transition-colors"
              >
                <p className="text-zinc-100 text-sm font-medium">
                  {rack.name || `${rack.owner_login}'s rack`}
                </p>
                <p className="text-zinc-500 text-xs mt-1">
                  {rack.rack_width_inches}" • {rack.rack_units}U • {rack.item_count} items
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
