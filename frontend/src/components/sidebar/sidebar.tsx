import { SidebarHeader } from "./sidebar-header";
import { SidebarRacksSection } from "./sidebar-racks-section";
import { SidebarPlaybooksSection } from "./sidebar-playbooks-section";
import { SidebarCodeSection } from "./sidebar-code-section";
import { SidebarFooter } from "./sidebar-footer";
import type { SidebarProps } from "./types";

export function Sidebar({
  status,
  rackEntries,
  playbooks,
  localRepos,
  pingStatuses,
  racksHref,
  playbooksHref,
  pathname,
  switchingRepo,
  onRepoChange,
  onOpenPublicKey,
  onLogout,
}: SidebarProps) {
  return (
    <aside className="w-full h-full shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-4 min-w-0">
      <SidebarHeader repoFullName={status?.repo?.full_name} />
      <nav className="space-y-1 overflow-y-auto flex-1 min-h-0">
        <SidebarRacksSection
          racksHref={racksHref}
          rackEntries={rackEntries}
          pingStatuses={pingStatuses}
          pathname={pathname}
        />
        <SidebarPlaybooksSection
          playbooksHref={playbooksHref}
          playbooks={playbooks}
          pathname={pathname}
        />
        <SidebarCodeSection />
      </nav>
      <SidebarFooter
        status={status}
        localRepos={localRepos}
        switchingRepo={switchingRepo}
        onRepoChange={onRepoChange}
        onPublicKeyClick={onOpenPublicKey}
        onLogout={onLogout}
      />
    </aside>
  );
}
