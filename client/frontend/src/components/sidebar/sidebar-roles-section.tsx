import { Puzzle } from "lucide-react";
import { useRoles } from "@/hooks/queries";
import { SidebarEntitySection } from "./sidebar-entity-section";

export function SidebarRolesSection() {
  const { data: roles = [] } = useRoles();
  return (
    <SidebarEntitySection
      title="Roles"
      icon={<Puzzle className="size-3 shrink-0" />}
      basePath="/roles"
      createPath="/roles/create"
      createLabel="Create role"
      collapsed
      items={roles}
      itemKey={(r) => r.id}
      itemPath={(r) => `/roles/${r.id}`}
      itemLabel={(r) => r.name}
      emptyMessage="No roles yet"
    />
  );
}
