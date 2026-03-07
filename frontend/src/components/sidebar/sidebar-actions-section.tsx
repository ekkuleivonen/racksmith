import { NavLink } from "react-router-dom";
import { Plus, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function SidebarActionsSection() {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border border-transparent">
        <NavLink
          to="/actions/new"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
              isActive
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
          <Zap className="size-3 shrink-0" />
          Actions
        </NavLink>
        <NavLink
          to="/actions/new"
          className="text-zinc-500 hover:text-zinc-100"
          aria-label="New action"
        >
          <Plus className="size-3" />
        </NavLink>
      </div>
    </div>
  );
}
