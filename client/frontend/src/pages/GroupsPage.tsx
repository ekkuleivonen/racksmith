import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { EntityListPage } from "@/components/shared/entity-list-page";
import { useGroups } from "@/hooks/queries";

export function GroupsPage() {
  const { data: groups = [], isLoading } = useGroups();

  return (
    <EntityListPage
      title="Groups"
      description="Organize nodes into groups for stack targeting."
      createPath="/groups/create"
      createLabel="Create"
      isLoading={isLoading}
      isEmpty={groups.length === 0}
      emptyTitle="No groups yet"
      emptyDescription="Create a group to organize nodes for stack runs."
    >
      <div className="space-y-1">
        {groups.map((group) => (
          <NavLink
            key={group.id}
            to={`/groups/${group.id}`}
            className={({ isActive }) =>
              cn(
                "block border border-zinc-800 bg-zinc-900/30 p-4 rounded-none transition-colors",
                isActive
                  ? "border-zinc-600 bg-zinc-800/50"
                  : "hover:border-zinc-700 hover:bg-zinc-900/50"
              )
            }
          >
            <p className="text-zinc-100 font-medium">{group.name}</p>
            {group.description ? (
              <p className="text-xs text-zinc-500 mt-0.5">{group.description}</p>
            ) : null}
          </NavLink>
        ))}
      </div>
    </EntityListPage>
  );
}
