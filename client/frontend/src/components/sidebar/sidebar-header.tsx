import { Link, NavLink, useLocation } from "react-router-dom";
import { useSetupStore } from "@/stores/setup";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

export function SidebarHeader() {
  const repoFullName = useSetupStore((s) => s.status?.repo?.full_name);
  const { user } = useAuth();
  const pathname = useLocation().pathname;
  const isSettingsActive = pathname.startsWith("/settings");

  return (
    <div className="flex items-start justify-between gap-2 px-3 py-2">
      <div className="space-y-1 min-w-0">
        <Link
          to="/"
          className="text-sm text-zinc-100 font-semibold tracking-wide hover:text-zinc-200 block"
        >
          RACKSMITH
        </Link>
        <p className="text-[10px] text-zinc-500">{repoFullName ?? ""}</p>
      </div>
      <NavLink
        to="/settings"
        title={user?.login ?? "Settings"}
        className={cn(
          "shrink-0 rounded-full transition-opacity ring-1 ring-transparent",
          isSettingsActive
            ? "opacity-100 ring-zinc-500"
            : "opacity-70 hover:opacity-100",
        )}
        aria-label="Settings"
      >
        {user?.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.login}
            className="size-6 rounded-full"
          />
        ) : (
          <div className="size-6 rounded-full bg-zinc-700" />
        )}
      </NavLink>
    </div>
  );
}
