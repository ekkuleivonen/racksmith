import { Layout } from "lucide-react";
import { useRackEntries } from "@/hooks/queries";
import { SidebarEntitySection } from "./sidebar-entity-section";

export function SidebarRacksSection() {
  const { data: rackEntries = [] } = useRackEntries();
  return (
    <SidebarEntitySection
      title="Racks"
      icon={<Layout className="size-3 shrink-0" />}
      createPath="/racks/create"
      createLabel="Create rack"
      items={rackEntries}
      itemKey={(e) => e.rack.id}
      itemPath={(e) => `/racks/view/${e.rack.id}`}
      itemLabel={(e) => e.rack.name}
      emptyMessage="No racks yet"
    />
  );
}
