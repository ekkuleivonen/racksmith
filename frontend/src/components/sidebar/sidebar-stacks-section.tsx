import { useLocation, NavLink } from "react-router-dom";
import { Layers, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStacks } from "@/hooks/queries";

export function SidebarStacksSection() {
  const location = useLocation();
  const pathname = location.pathname;

  const { data: stacks = [] } = useStacks();

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border border-transparent">
        <NavLink
          to="/stacks"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
              isActive || pathname.startsWith("/stacks")
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
          <Layers className="size-3 shrink-0" />
          Stacks
        </NavLink>
        <NavLink
          to="/stacks/create"
          className="text-zinc-500 hover:text-zinc-100"
          aria-label="Create stack"
        >
          <Plus className="size-3" />
        </NavLink>
      </div>
      <div className="space-y-1 pl-2">
        {stacks.length === 0 ? (
          <p className="px-2 py-1 text-[10px] text-zinc-500">
            No stacks yet
          </p>
        ) : (
          stacks.map((stack) => (
            <NavLink
              key={stack.id}
              to={`/stacks/${stack.id}`}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-none px-2 py-1.5 text-[11px] border border-transparent",
                  isActive
                    ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                    : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900",
                )
              }
            >
              <span className="truncate">{stack.name}</span>
            </NavLink>
          ))
        )}
      </div>
    </div>
  );
}
