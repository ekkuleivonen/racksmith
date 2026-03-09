import { NavLink, useLocation } from "react-router-dom";
import { Puzzle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function SidebarRolesSection() {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border border-transparent">
        <NavLink
          to="/roles"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
              isActive || pathname.startsWith("/roles")
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
          <Puzzle className="size-3 shrink-0" />
          Roles
        </NavLink>
        <NavLink
          to="/roles/create"
          className="text-zinc-500 hover:text-zinc-100"
          aria-label="Create role"
        >
          <Plus className="size-3" />
        </NavLink>
      </div>
    </div>
  );
}
