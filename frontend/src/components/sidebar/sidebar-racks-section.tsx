import { useLocation, NavLink } from "react-router-dom";
import { ChevronRight, Layout, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useRackStore } from "@/stores/racks";
import { usePingStore } from "@/stores/ping";
import { nodeStatusKey } from "@/lib/ssh";

export function SidebarRacksSection() {
  const location = useLocation();
  const pathname = location.pathname;

  const rackEntries = useRackStore((s) => s.rackEntries);
  const pingStatuses = usePingStore((s) => s.statuses);

  const racksHref = "/racks";
  const defaultExpanded = rackEntries.map(({ rack }) => rack.slug);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border border-transparent">
        <NavLink
          to={racksHref}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
              isActive || pathname === "/racks" || pathname.startsWith("/rack/")
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
          <Layout className="size-3 shrink-0" />
          Racks
        </NavLink>
        <NavLink
          to="/rack/create"
          className="text-zinc-500 hover:text-zinc-100"
          aria-label="Create rack"
        >
          <Plus className="size-3" />
        </NavLink>
      </div>
      <div className="space-y-1 pl-2">
        {rackEntries.length === 0 ? (
          <p className="px-2 py-0.5 text-[10px] text-zinc-500">No racks yet</p>
        ) : (
          <Accordion
            type="multiple"
            defaultValue={defaultExpanded}
            className="w-full border-0"
          >
            {rackEntries.map(({ rack, nodes }) => (
              <AccordionItem
                key={rack.slug}
                value={rack.slug}
                className="border-0"
              >
                <AccordionTrigger hideIcon className="py-0.5 pl-0.5 pr-1.5 hover:no-underline font-normal rounded text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300 flex items-center gap-1.5 group">
                  <button
                    type="button"
                    className="shrink-0 p-0.5 -m-0.5 flex items-center justify-center rounded cursor-pointer hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 transition-transform group-data-[state=open]:rotate-90"
                    aria-label="Expand or collapse rack"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                  <NavLink
                    to={`/rack/view/${rack.slug}`}
                    onClick={(e) => e.stopPropagation()}
                    className={({ isActive }) =>
                      cn(
                        "flex-1 min-w-0 truncate text-left text-[11px] rounded-none py-0.5 -mx-1 px-1",
                        isActive
                          ? "text-zinc-100"
                          : "text-zinc-400 hover:text-zinc-300",
                      )
                    }
                  >
                    {rack.name}
                  </NavLink>
                </AccordionTrigger>
                <AccordionContent className="pt-0 !pb-0 !h-auto [&_a]:no-underline">
                  <div className="space-y-0.5 border-l border-zinc-800 ml-2 pl-2">
                    {nodes.length === 0 ? (
                      <p className="px-2 py-0.5 text-[10px] text-zinc-600">
                        No hardware yet
                      </p>
                    ) : (
                      nodes.map((node) => {
                        const nodeStatus =
                          pingStatuses[nodeStatusKey(node.slug)] ?? "unknown";
                        return (
                          <NavLink
                            key={node.slug}
                            to={`/nodes/${node.slug}`}
                            className={({ isActive }) =>
                              cn(
                                "flex items-center gap-1.5 rounded py-0.5 px-1.5 text-xs no-underline",
                                isActive
                                  ? "bg-zinc-700 text-zinc-100"
                                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300",
                              )
                            }
                          >
                            <span
                              className={cn(
                                "size-1 shrink-0 rounded-full",
                                nodeStatus === "online" && "bg-emerald-400",
                                nodeStatus === "offline" && "bg-red-500",
                                nodeStatus === "unknown" && "bg-zinc-700",
                              )}
                              title={
                                nodeStatus === "online"
                                  ? "Online"
                                  : nodeStatus === "offline"
                                    ? "Offline"
                                    : "Unknown"
                              }
                            />
                            <span className="truncate">
                              {node.name || node.host || node.slug}
                            </span>
                          </NavLink>
                        );
                      })
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}
