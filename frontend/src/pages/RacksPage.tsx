import { NavLink } from "react-router-dom";
import { Plus } from "lucide-react";
import { useRackEntries } from "@/hooks/queries";
import { cn } from "@/lib/utils";

export function RacksPage() {
  const { data: rackEntries = [] } = useRackEntries();

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-zinc-100 font-semibold">Racks</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Define rack topology and hardware placement. Add servers and
                network gear.
              </p>
            </div>
            <NavLink
              to="/racks/create"
              className="text-zinc-500 hover:text-zinc-100"
              aria-label="Create rack"
            >
              <Plus className="size-4" />
            </NavLink>
          </div>
        </section>

        <section className="space-y-2">
          {rackEntries.length === 0 ? (
            <div className="border border-zinc-800 bg-zinc-900/30 p-6 text-center">
              <p className="text-zinc-500 text-sm">No racks yet</p>
              <p className="text-xs text-zinc-600 mt-1">
                Create your first rack to define hardware topology.
              </p>
              <NavLink
                to="/racks/create"
                className="inline-block mt-3 text-sm text-zinc-400 hover:text-zinc-100"
              >
                Create rack
              </NavLink>
            </div>
          ) : (
            <div className="space-y-1">
              {rackEntries.map(({ rack }) => (
                <NavLink
                  key={rack.id}
                  to={`/racks/view/${rack.id}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 border border-zinc-800 bg-zinc-900/30 p-4 transition-colors",
                      isActive
                        ? "border-zinc-600 bg-zinc-800/50"
                        : "hover:border-zinc-700 hover:bg-zinc-900/50",
                    )
                  }
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-zinc-100 font-medium truncate">
                      {rack.name}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {rack.rack_units}U · {rack.rack_width_inches}" ·{" "}
                      {rack.rack_cols} cols
                    </p>
                  </div>
                </NavLink>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
