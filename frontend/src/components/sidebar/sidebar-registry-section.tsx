import { NavLink, useLocation } from "react-router-dom";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export function SidebarRegistrySection() {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-2 py-1.5 border border-transparent">
        <NavLink
          to="/registry"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
              isActive || pathname.startsWith("/registry")
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
          <Globe className="size-3 shrink-0" />
          Registry
        </NavLink>
      </div>
    </div>
  );
}
