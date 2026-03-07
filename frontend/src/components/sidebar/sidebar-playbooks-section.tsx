import { useLocation, NavLink } from "react-router-dom";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlaybookStore } from "@/stores/playbooks";

export function SidebarPlaybooksSection() {
  const location = useLocation();
  const pathname = location.pathname;

  const playbooks = usePlaybookStore((s) => s.playbooks);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border border-transparent">
        <NavLink
          to="/playbooks"
          className={({ isActive }) =>
            cn(
              "text-[11px] uppercase tracking-wide",
              isActive || pathname.startsWith("/playbooks")
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
          Playbooks
        </NavLink>
        <NavLink
          to="/playbooks/create"
          className="text-zinc-500 hover:text-zinc-100"
          aria-label="Create playbook"
        >
          <Plus className="size-3" />
        </NavLink>
      </div>
      <div className="space-y-1 pl-2">
        {playbooks.length === 0 ? (
          <p className="px-2 py-1 text-[10px] text-zinc-500">
            No playbooks yet
          </p>
        ) : (
          playbooks.map((playbook) => (
            <NavLink
              key={playbook.id}
              to={`/playbooks/${playbook.id}`}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-none px-2 py-1.5 text-[11px] border border-transparent",
                  isActive
                    ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                    : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900",
                )
              }
            >
              <span className="truncate">{playbook.play_name}</span>
            </NavLink>
          ))
        )}
      </div>
    </div>
  );
}
