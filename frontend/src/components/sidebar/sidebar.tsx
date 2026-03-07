import { SidebarHeader } from "./sidebar-header";
import { SidebarNodesSection } from "./sidebar-nodes-section";
import { SidebarRacksSection } from "./sidebar-racks-section";
import { SidebarGroupsSection } from "./sidebar-groups-section";
import { SidebarStacksSection } from "./sidebar-stacks-section";
import { SidebarActionsSection } from "./sidebar-actions-section";
import { SidebarCodeSection } from "./sidebar-code-section";
import { SidebarFooter } from "./sidebar-footer";

type SidebarProps = {
  onLogout: () => void;
};

export function Sidebar({ onLogout }: SidebarProps) {
  return (
    <aside className="w-full h-full shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-2 flex flex-col gap-3 min-w-0">
      <SidebarHeader />
      <nav className="scrollbar-hide space-y-0.5 overflow-x-visible overflow-y-auto flex-1 min-h-0">
        <SidebarNodesSection />
        <SidebarRacksSection />
        <SidebarGroupsSection />
        <SidebarStacksSection />
        <SidebarActionsSection />
        <SidebarCodeSection />
      </nav>
      <SidebarFooter onLogout={onLogout} />
    </aside>
  );
}
