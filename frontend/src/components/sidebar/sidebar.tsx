import { useEffect, useState } from "react";
import { Code2, LayoutGrid } from "lucide-react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SidebarHeader } from "./sidebar-header";
import { SidebarHostsSection } from "./sidebar-hosts-section";
import { SidebarRacksSection } from "./sidebar-racks-section";
import { SidebarGroupsSection } from "./sidebar-groups-section";
import { SidebarPlaybooksSection } from "./sidebar-playbooks-section";
import { SidebarRolesSection } from "./sidebar-roles-section";
import { SidebarRegistrySection } from "./sidebar-registry-section";
import { SidebarCodeSection } from "./sidebar-code-section";
import { SidebarFooter } from "./sidebar-footer";

type SidebarProps = {
  onLogout: () => void;
};

export function Sidebar({ onLogout }: SidebarProps) {
  const { pathname } = useLocation();
  const [activeTab, setActiveTab] = useState<"ui" | "code">(
    pathname.startsWith("/code") ? "code" : "ui",
  );

  useEffect(() => {
    if (pathname.startsWith("/code")) {
      setActiveTab("code");
    }
  }, [pathname]);

  return (
    <aside className="w-full h-full shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-2 flex flex-col gap-3 min-w-0">
      <SidebarHeader />
      <div className="mx-2 border border-zinc-800 bg-zinc-900/70">
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
            onClick={() => setActiveTab("code")}
            title="Code"
            aria-label="Code"
            className={cn(
              "py-1.5 transition-colors flex items-center justify-center",
              activeTab === "code"
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
            <SidebarHostsSection />
            <SidebarRacksSection />
            <SidebarGroupsSection />
            <SidebarPlaybooksSection />
            <SidebarRolesSection />
            <SidebarRegistrySection />
          </>
        ) : (
          <SidebarCodeSection />
        )}
      </nav>
      <SidebarFooter onLogout={onLogout} />
    </aside>
  );
}
