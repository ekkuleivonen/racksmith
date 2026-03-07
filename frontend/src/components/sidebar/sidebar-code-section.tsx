import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

export function SidebarCodeSection() {
  return (
    <NavLink
      to="/code"
      className={({ isActive }) =>
        cn(
          "flex items-center rounded-none px-3 py-1.5 text-[11px] uppercase tracking-wide border border-transparent",
          isActive
            ? "bg-zinc-800 text-zinc-100 border-zinc-700"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900",
        )
      }
    >
      Code
    </NavLink>
  );
}
