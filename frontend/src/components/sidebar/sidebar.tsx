import { SidebarHeader } from "./sidebar-header";
import { SidebarRacksSection } from "./sidebar-racks-section";
import { SidebarPlaybooksSection } from "./sidebar-playbooks-section";
import { SidebarCodeSection } from "./sidebar-code-section";
import { SidebarFooter } from "./sidebar-footer";

type SidebarProps = {
  onLogout: () => void;
};

export function Sidebar({ onLogout }: SidebarProps) {
  return (
    <aside className="w-full h-full shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-4 min-w-0">
      <SidebarHeader />
      <nav className="space-y-1 overflow-y-auto flex-1 min-h-0">
        <SidebarRacksSection />
        <SidebarPlaybooksSection />
        <SidebarCodeSection />
      </nav>
      <SidebarFooter onLogout={onLogout} />
    </aside>
  );
}
