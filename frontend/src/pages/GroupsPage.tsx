import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Plus } from "lucide-react";
import { useGroupsStore } from "@/stores/groups";
import { cn } from "@/lib/utils";

export function GroupsPage() {
  const groups = useGroupsStore((s) => s.groups);
  const load = useGroupsStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-zinc-100 font-semibold">Groups</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Organize nodes into groups for stack targeting.
              </p>
            </div>
            <NavLink
              to="/groups/create"
              className="text-zinc-500 hover:text-zinc-100"
              aria-label="Create group"
            >
              <Plus className="size-4" />
            </NavLink>
          </div>
        </section>

        <section className="space-y-2">
          {groups.length === 0 ? (
            <div className="border border-zinc-800 bg-zinc-900/30 p-6 text-center">
              <p className="text-zinc-500 text-sm">No groups yet</p>
              <p className="text-xs text-zinc-600 mt-1">
                Create a group to organize nodes for stack runs.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {groups.map((group) => (
                <NavLink
                  key={group.slug}
                  to={`/groups/${group.slug}`}
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
          )}
        </section>
      </div>
    </div>
  );
}
