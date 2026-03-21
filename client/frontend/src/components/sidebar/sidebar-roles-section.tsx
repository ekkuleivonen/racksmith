import { NavLink, useLocation } from "react-router-dom";
import { Plus, Puzzle, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoles } from "@/hooks/queries";
import { useMoveRoleToFolder } from "@/hooks/mutations";
import { usePinsStore, useRepoKey, type PinEntry } from "@/stores/pins";
import { SidebarFolderTree } from "./sidebar-folder-tree";

const EMPTY_PINS: PinEntry[] = [];

export function SidebarRolesSection() {
  const { data: roles = [] } = useRoles();
  const { pathname } = useLocation();
  const moveMutation = useMoveRoleToFolder();

  const repoKey = useRepoKey();
  const allPins = usePinsStore((s) => s.pins[repoKey] ?? EMPTY_PINS);
  const togglePin = usePinsStore((s) => s.togglePin);
  const rolePins = allPins.filter((p) => p.path.startsWith("/roles/"));

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

      {rolePins.length > 0 && (
        <div className="space-y-0.5 pl-2">
          {rolePins.map((pin) => (
            <div key={pin.path} className="group flex items-center gap-1">
              <NavLink
                to={pin.path}
                className={cn(
                  "flex-1 flex items-center gap-1.5 rounded py-0.5 px-1.5 text-[11px] no-underline truncate",
                  pathname === pin.path
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300",
                )}
              >
                <Star className="size-2.5 shrink-0 fill-yellow-400/80 text-yellow-400/80" />
                <span className="truncate">{pin.label}</span>
              </NavLink>
              <button
                type="button"
                onClick={() => togglePin(repoKey, pin.path, pin.label)}
                className="opacity-0 group-hover:opacity-100 shrink-0 text-zinc-500 hover:text-zinc-300 transition-opacity p-0.5"
                aria-label={`Unpin ${pin.label}`}
              >
                <X className="size-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <SidebarFolderTree
        items={roles}
        itemKey={(r) => r.id}
        itemPath={(r) => `/roles/${r.id}`}
        itemLabel={(r) => r.name}
        itemFolder={(r) => r.folder}
        onMoveToFolder={(roleId, folder) =>
          moveMutation.mutate({ roleId, folder })
        }
        onToggleStar={(path, label) => togglePin(repoKey, path, label)}
        isStarred={(path) => allPins.some((p) => p.path === path)}
        storageKey="roles"
      />

      {roles.length === 0 && (
        <p className="px-4 py-0.5 text-[10px] text-zinc-500">No roles yet</p>
      )}
    </div>
  );
}
