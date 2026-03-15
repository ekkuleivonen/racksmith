import { useState } from "react";
import { Code2, LayoutGrid, Monitor, Plus } from "lucide-react";
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
      <nav className="scrollbar-hide space-y-0.5 overflow-x-visible overflow-y-auto flex-1 min-h-0">
        {activeTab === "ui" ? (
          <>
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
