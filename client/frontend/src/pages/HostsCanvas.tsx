import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { BottomBarLayout } from "@/components/bottom-bar/bottom-bar-layout";
import { useCanvasParams } from "@/hooks/use-canvas-params";
import { ViewSwitcher } from "@/components/canvas/view-switcher";
import { FilterBar } from "@/components/canvas/filter-bar";
import { HostsListView } from "@/components/canvas/hosts-list-view";
import { RacksOverview } from "@/components/canvas/racks-overview";
import { NetworkView } from "@/components/canvas/network-view";
import { HostDetailPanel } from "@/components/canvas/host-detail-panel";
import { BulkActionBar } from "@/components/canvas/bulk-action-bar";

export function HostsCanvas() {
  const [params, actions] = useCanvasParams();
  const { view, selectedHostId, filters } = params;

  return (
    <div className="h-full flex flex-col">
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={selectedHostId ? 55 : 100} minSize={15} className="min-h-0">
          <BottomBarLayout>
            <div className="h-full flex flex-col min-h-0">
              <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-zinc-800 shrink-0">
                <FilterBar filters={filters} actions={actions} />
                <ViewSwitcher view={view} onViewChange={actions.setView} />
              </div>
              <div className="flex-1 min-h-0 relative flex flex-col">
                <BulkActionBar />
                {view === "list" && (
                  <HostsListView
                    filters={filters}
                    selectedHostId={selectedHostId}
                    onSelectHost={actions.selectHost}
                  />
                )}
                {view === "rack" && (
                  <RacksOverview
                    filters={filters}
                    selectedHostId={selectedHostId}
                    onSelectHost={actions.selectHost}
                  />
                )}
                {view === "network" && (
                  <NetworkView
                    filters={filters}
                    selectedHostId={selectedHostId}
                    onSelectHost={actions.selectHost}
                  />
                )}
              </div>
            </div>
          </BottomBarLayout>
        </ResizablePanel>
        {selectedHostId && (
          <>
            <ResizableHandle withHandle className="bg-zinc-800" />
            <ResizablePanel defaultSize={45} minSize={15} className="min-h-0">
              <HostDetailPanel
                hostId={selectedHostId}
                onClose={() => actions.selectHost(null)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
