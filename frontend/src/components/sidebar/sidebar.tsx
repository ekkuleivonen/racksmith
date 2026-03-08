import { useEffect, useState } from "react";
import { Code2, LayoutGrid } from "lucide-react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SidebarHeader } from "./sidebar-header";
import { SidebarNodesSection } from "./sidebar-nodes-section";
import { SidebarRacksSection } from "./sidebar-racks-section";
import { SidebarGroupsSection } from "./sidebar-groups-section";
import { SidebarStacksSection } from "./sidebar-stacks-section";
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
      <div className="mx-2 rounded-lg bg-zinc-800/50 p-0.5">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("ui")}
            className={cn(
              "flex-1 rounded-md py-1.5 text-[11px] transition-colors flex items-center justify-center gap-1.5",
              activeTab === "ui"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <LayoutGrid className="size-3 shrink-0" />
            UI view
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("code")}
            className={cn(
              "flex-1 rounded-md py-1.5 text-[11px] transition-colors flex items-center justify-center gap-1.5",
              activeTab === "code"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <Code2 className="size-3 shrink-0" />
            Code view
          </button>
        </div>
      </div>
      <nav className="scrollbar-hide space-y-0.5 overflow-x-visible overflow-y-auto flex-1 min-h-0">
        {activeTab === "ui" ? (
          <>
            <SidebarNodesSection />
            <SidebarRacksSection />
            <SidebarGroupsSection />
            <SidebarStacksSection />
          </>
        ) : (
          <SidebarCodeSection />
        )}
      </nav>
      <SidebarFooter onLogout={onLogout} />
    </aside>
  );
}
