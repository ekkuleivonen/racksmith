import { Folder } from "lucide-react";
import { useGroups } from "@/hooks/queries";
import { SidebarEntitySection } from "./sidebar-entity-section";

export function SidebarGroupsSection() {
  const { data: groups = [] } = useGroups();
  return (
    <SidebarEntitySection
      title="Groups"
      icon={<Folder className="size-3 shrink-0" />}
      basePath="/groups"
      createPath="/groups/create"
      createLabel="Create group"
      items={groups}
      itemKey={(g) => g.id}
      itemPath={(g) => `/groups/${g.id}`}
      itemLabel={(g) => g.name}
      emptyMessage="No groups yet"
    />
  );
}
