import { useState } from "react";
import { Code2, LayoutGrid, Monitor, Pin, Plus, Search, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SidebarHeader } from "./sidebar-header";
import { SidebarRacksSection } from "./sidebar-racks-section";
import { SidebarGroupsSection } from "./sidebar-groups-section";
import { SidebarPlaybooksSection } from "./sidebar-playbooks-section";
import { SidebarRolesSection } from "./sidebar-roles-section";
import { SidebarFilesSection } from "./sidebar-files-section";
import { SidebarFooter } from "./sidebar-footer";
import { AddHostDialog } from "@/components/hosts/add-host-dialog";
import { usePinsStore } from "@/stores/pins";
import { useSetupStore } from "@/stores/setup";

function SidebarPinnedSection() {
  const status = useSetupStore((s) => s.status);
  const repoKey = status ? `${status.user.login}/${status.repo?.full_name ?? ""}` : "";
  const pins = usePinsStore((s) => s.getPins(repoKey));
  const togglePin = usePinsStore((s) => s.togglePin);
  const { pathname } = useLocation();

  if (pins.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <Pin className="size-3 shrink-0 text-zinc-500" />
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          Pinned
        </span>
      </div>
      <div className="space-y-0.5 pl-2">
        {pins.map((pin) => (
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
    </div>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();
  const [addHostOpen, setAddHostOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"ui" | "files">(
    pathname.startsWith("/files") ? "files" : "ui",
  );
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (pathname.startsWith("/files")) {
      setActiveTab("files");
    }
  }

  return (
    <aside className="w-full h-full shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-3 flex flex-col gap-4 min-w-0">
      <SidebarHeader />
      <div className="border border-zinc-800 bg-zinc-900/70">
        <div className="grid grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveTab("ui")}
            title="UI"
            aria-label="UI"
            className={cn(
              "py-1.5 transition-colors flex items-center justify-center border-r border-zinc-800",
              activeTab === "ui"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <LayoutGrid className="size-3.5 shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("files")}
            title="Files"
            aria-label="Files"
            className={cn(
              "py-1.5 transition-colors flex items-center justify-center",
              activeTab === "files"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <Code2 className="size-3.5 shrink-0" />
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
        }}
        className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 border border-zinc-800 bg-zinc-900/70 transition-colors w-full"
      >
        <Search className="size-3 shrink-0" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="text-[10px] text-zinc-600 border border-zinc-700 rounded px-1 py-0.5 leading-none">⌘K</kbd>
      </button>
      <nav className="scrollbar-hide space-y-0.5 overflow-x-visible overflow-y-auto flex-1 min-h-0">
        {activeTab === "ui" ? (
          <>
            <SidebarPinnedSection />
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
                    isActive
                      ? "text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200",
                  )
                }
              >
                <Monitor className="size-3 shrink-0" />
                Hosts
              </NavLink>
              <button
                type="button"
                onClick={() => setAddHostOpen(true)}
                className="text-zinc-500 hover:text-zinc-100"
                aria-label="Add host"
              >
                <Plus className="size-3" />
              </button>
            </div>
            <AddHostDialog
              open={addHostOpen}
              onOpenChange={setAddHostOpen}
            />
            <SidebarRacksSection />
            <SidebarGroupsSection />
            <SidebarPlaybooksSection />
            <SidebarRolesSection />
          </>
        ) : (
          <SidebarFilesSection />
        )}
      </nav>
      <SidebarFooter />
    </aside>
  );
}
