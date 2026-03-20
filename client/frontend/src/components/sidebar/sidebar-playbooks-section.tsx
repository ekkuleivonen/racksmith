import { Layers } from "lucide-react";
import { usePlaybooks } from "@/hooks/queries";
import { SidebarEntitySection } from "./sidebar-entity-section";

export function SidebarPlaybooksSection() {
  const { data: playbooks = [] } = usePlaybooks();
  return (
    <SidebarEntitySection
      title="Playbooks"
      icon={<Layers className="size-3 shrink-0" />}
      basePath="/playbooks"
      createPath="/playbooks/create"
      createLabel="Create playbook"
      collapsed
      items={playbooks}
      itemKey={(p) => p.id}
      itemPath={(p) => `/playbooks/${p.id}`}
      itemLabel={(p) => p.name}
      emptyMessage="No playbooks yet"
    />
  );
}
