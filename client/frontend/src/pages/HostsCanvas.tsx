import { BottomBarLayout } from "@/components/bottom-bar/bottom-bar-layout";
import { useCanvasParams } from "@/hooks/use-canvas-params";
import { ViewSwitcher } from "@/components/canvas/view-switcher";
import { FilterBar } from "@/components/canvas/filter-bar";
import { HostsListView } from "@/components/canvas/hosts-list-view";
import { RacksOverview } from "@/components/canvas/racks-overview";
import { NetworkView } from "@/components/canvas/network-view";
import { BulkActionBar } from "@/components/canvas/bulk-action-bar";

export function HostsCanvas() {
  const [params, actions] = useCanvasParams();
  const { view, filters } = params;

  return (
    <div className="h-full flex flex-col">
      <BottomBarLayout>
        <div className="h-full flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-zinc-800 shrink-0">
            <FilterBar filters={filters} actions={actions} />
            <ViewSwitcher view={view} onViewChange={actions.setView} />
          </div>
          <div className="flex-1 min-h-0 relative flex flex-col">
            <BulkActionBar />
            {view === "list" && <HostsListView filters={filters} />}
            {view === "rack" && <RacksOverview filters={filters} />}
            {view === "network" && <NetworkView filters={filters} />}
          </div>
        </div>
      </BottomBarLayout>
    </div>
  );
}
