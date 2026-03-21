import { NavLink, useLocation } from "react-router-dom";
import { Layers, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlaybooks } from "@/hooks/queries";
import { useMovePlaybookToFolder } from "@/hooks/mutations";
import { usePinsStore, type PinEntry } from "@/stores/pins";
import { useSetupStore } from "@/stores/setup";
import { SidebarFolderTree } from "./sidebar-folder-tree";

const EMPTY_PINS: PinEntry[] = [];

function useRepoKey() {
  const status = useSetupStore((s) => s.status);
  return status ? `${status.user.login}/${status.repo?.full_name ?? ""}` : "";
}

export function SidebarPlaybooksSection() {
  const { data: playbooks = [] } = usePlaybooks();
  const { pathname } = useLocation();
  const moveMutation = useMovePlaybookToFolder();

  const repoKey = useRepoKey();
  const allPins = usePinsStore((s) => s.pins[repoKey] ?? EMPTY_PINS);
  const togglePin = usePinsStore((s) => s.togglePin);
  const playbookPins = allPins.filter((p) => p.path.startsWith("/playbooks/"));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border border-transparent">
        <NavLink
          to="/playbooks"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
              isActive || pathname.startsWith("/playbooks")
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
          <Layers className="size-3 shrink-0" />
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

      {playbookPins.length > 0 && (
        <div className="space-y-0.5 pl-2">
          {playbookPins.map((pin) => (
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
        items={playbooks}
        itemKey={(p) => p.id}
        itemPath={(p) => `/playbooks/${p.id}`}
        itemLabel={(p) => p.name}
        itemFolder={(p) => p.folder}
        onMoveToFolder={(playbookId, folder) =>
          moveMutation.mutate({ playbookId, folder })
        }
        storageKey="playbooks"
      />

      {playbooks.length === 0 && (
        <p className="px-4 py-0.5 text-[10px] text-zinc-500">No playbooks yet</p>
      )}
    </div>
  );
}
