import { useLocation, NavLink } from "react-router-dom";
import { Folder, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGroupsStore } from "@/stores/groups";

export function SidebarGroupsSection() {
  const location = useLocation();
  const pathname = location.pathname;
  const groups = useGroupsStore((s) => s.groups);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border border-transparent">
        <NavLink
          to="/groups"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
              isActive || pathname.startsWith("/groups")
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
          <Folder className="size-3 shrink-0" />
          Groups
        </NavLink>
        <NavLink
          to="/groups/create"
          className="text-zinc-500 hover:text-zinc-100"
          aria-label="Create group"
        >
          <Plus className="size-3" />
        </NavLink>
      </div>
      <div className="space-y-1 pl-2">
        {groups.length === 0 ? (
          <p className="px-2 py-0.5 text-[10px] text-zinc-500">No groups yet</p>
        ) : (
          <div className="space-y-0.5">
            {groups.map((group) => (
              <NavLink
                key={group.slug}
                to={`/groups/${group.slug}`}
                className={({ isActive }) =>
                  cn(
                    "block rounded py-0.5 px-1.5 text-[11px] no-underline",
                    isActive
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300",
                  )
                }
              >
                <span className="truncate block">{group.name}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
