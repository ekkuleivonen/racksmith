import { useCallback, useMemo } from "react";
import { CheckSquare, ExternalLink, MoreVertical } from "lucide-react";
import { NavLink } from "react-router-dom";
import { RackCanvas } from "@/components/racks/rack-canvas";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useRackEntries } from "@/hooks/queries";
import type { RackLayoutHost } from "@/lib/racks";
import { matchesCanvasHostFilters, type Host } from "@/lib/hosts";
import { usePingStore } from "@/stores/ping";
import { useSelection } from "@/stores/selection";
import type { CanvasFilters } from "@/hooks/use-canvas-params";

interface RacksOverviewProps {
  filters: CanvasFilters;
}

export function RacksOverview({ filters }: RacksOverviewProps) {
  const { data: rackEntries = [] } = useRackEntries();
  const pingStatuses = usePingStore((s) => s.statuses);
  const multiSelected = useSelection((s) => s.selected);
  const selectionToggle = useSelection((s) => s.toggle);
  const selectionAddMany = useSelection((s) => s.addMany);

  const hasFilters = filters.search || filters.groups.length > 0 || filters.labels.length > 0 || filters.status.length > 0 || filters.subnets.length > 0;

  const rackDataMap = useMemo(() => {
    const map = new Map<string, { filteredHosts: RackLayoutHost[]; rackHostIds: string[] }>();
    for (const { rack, hosts } of rackEntries) {
      const layoutHosts: RackLayoutHost[] = hosts ?? [];
      const unmanagedHosts = layoutHosts.filter((h) => !h.managed);
      const managedHosts = layoutHosts.filter((h) => h.managed);
      const filteredManaged = hasFilters
        ? managedHosts.filter((h) =>
            matchesCanvasHostFilters(h as unknown as Host, filters, pingStatuses),
          )
        : managedHosts;
      const filteredHosts = [...filteredManaged, ...unmanagedHosts];
      const rackHostIds = filteredManaged.map((h) => h.id);
      map.set(rack.id, { filteredHosts, rackHostIds });
    }
    return map;
  }, [rackEntries, hasFilters, filters, pingStatuses]);

  const handleItemClick = useCallback(
    (id: string) => {
      selectionToggle(id);
    },
    [selectionToggle],
  );

  if (rackEntries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="text-center space-y-2">
          <p className="text-sm text-zinc-400">No racks yet</p>
          <p className="text-xs text-zinc-600">Define your rack topology and place hardware items.</p>
          <NavLink
            to="/racks/create"
            className="inline-block mt-2 text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-700 px-3 py-1.5 transition-colors hover:border-zinc-600"
          >
            Create your first rack
          </NavLink>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {rackEntries.map(({ rack }) => {
          const { filteredHosts, rackHostIds } = rackDataMap.get(rack.id) ?? { filteredHosts: [], rackHostIds: [] };

          return (
            <div key={rack.id} className="border border-zinc-800 bg-zinc-900/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{rack.name}</p>
                  <p className="text-[10px] text-zinc-500">
                    {rack.rack_units}U · {rack.rack_width_inches}" · {rack.rack_cols} cols
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7">
                      <MoreVertical className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <NavLink to={`/racks/view/${rack.id}`} className="flex items-center gap-2">
                        <ExternalLink className="size-3" />
                        Edit rack
                      </NavLink>
                    </DropdownMenuItem>
                    {rackHostIds.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => selectionAddMany(rackHostIds)}
                          className="flex items-center gap-2"
                        >
                          <CheckSquare className="size-3" />
                          Select all in rack
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div>
                <RackCanvas
                  rackUnits={rack.rack_units}
                  cols={rack.rack_cols}
                  items={filteredHosts}
                  multiSelectedIds={multiSelected}
                  onSelectItem={(id) => handleItemClick(id)}
                  enableHostContextMenu
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
