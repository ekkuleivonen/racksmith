import { useState } from "react";
import { useLocation, NavLink } from "react-router-dom";
import { Plus, Zap, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActionsStore } from "@/stores/actions";

export function SidebarActionsSection() {
  const location = useLocation();
  const pathname = location.pathname;
  const actions = useActionsStore((s) => s.actions);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border border-transparent">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-zinc-500 hover:text-zinc-300 shrink-0"
            aria-label={open ? "Collapse actions" : "Expand actions"}
          >
            <ChevronRight
              className={cn("size-3 transition-transform", open && "rotate-90")}
            />
          </button>
          <NavLink
            to="/actions"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
                isActive || pathname.startsWith("/actions")
                  ? "text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200",
              )
            }
          >
            <Zap className="size-3 shrink-0" />
            Actions
          </NavLink>
        </div>
        <NavLink
          to="/actions/create"
          className="text-zinc-500 hover:text-zinc-100 shrink-0"
          aria-label="New action"
        >
          <Plus className="size-3" />
        </NavLink>
      </div>
      {open && (
        <div className="space-y-1 pl-2">
          {actions.length === 0 ? (
            <p className="px-2 py-1 text-[10px] text-zinc-500">
              No actions yet
            </p>
          ) : (
            actions.map((action) => (
              <NavLink
                key={action.slug}
                to={`/actions/${action.slug}`}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-none px-2 py-1.5 text-[11px] border border-transparent",
                    isActive
                      ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                      : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900",
                  )
                }
              >
                <span className="truncate">{action.name}</span>
              </NavLink>
            ))
          )}
        </div>
      )}
    </div>
  );
}
