import { NavLink } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { itemStatusKey } from "./types";
import type { SidebarRacksSectionProps } from "./types";

export function SidebarRacksSection({
  racksHref,
  rackEntries,
  pingStatuses,
  pathname,
}: SidebarRacksSectionProps) {
  const defaultExpanded = rackEntries.map(({ rack }) => rack.id);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border border-transparent">
        <NavLink
          to={racksHref}
          className={({ isActive }) =>
            cn(
              "text-[11px] uppercase tracking-wide",
              isActive || pathname.startsWith("/rack/")
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
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
      <div className="space-y-1 pl-3">
        {rackEntries.length === 0 ? (
          <p className="px-3 py-1 text-[10px] text-zinc-500">No racks yet</p>
        ) : (
          <Accordion
            type="multiple"
            defaultValue={defaultExpanded}
            className="w-full border-0"
          >
            {rackEntries.map(({ rack, items }) => (
              <AccordionItem
                key={rack.id}
                value={rack.id}
                className="border-0"
              >
                <AccordionTrigger hideIcon className="py-1.5 pl-1 pr-3 hover:no-underline bg-transparent hover:bg-transparent flex items-center gap-1.5 group">
                  <button
                    type="button"
                    className="shrink-0 w-6 h-6 -ml-0.5 flex items-center justify-center rounded cursor-pointer hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 transition-transform group-data-[state=open]:rotate-90"
                    aria-label="Expand or collapse rack"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                  <NavLink
                    to={`/rack/view/${rack.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className={({ isActive }) =>
                      cn(
                        "flex-1 min-w-0 truncate text-left text-[11px] rounded-none py-1 -mx-1 px-1",
                        isActive
                          ? "text-zinc-100"
                          : "text-zinc-300 hover:text-zinc-100",
                      )
                    }
                  >
                    {rack.name}
                  </NavLink>
                </AccordionTrigger>
                <AccordionContent className="pt-0 pb-1">
                  <div className="space-y-1 pl-3">
                    {items.length === 0 ? (
                      <p className="px-3 py-1 text-[10px] text-zinc-600">
                        No hardware yet
                      </p>
                    ) : (
                      items.map((item) => {
                        const itemStatus =
                          pingStatuses[itemStatusKey(rack.id, item.id)] ??
                          "unknown";
                        return (
                          <NavLink
                            key={item.id}
                            to={`/rack/${rack.id}/item/${item.id}`}
                            className={({ isActive }) =>
                              cn(
                                "flex items-center gap-2 rounded-none px-3 py-1 text-[10px] border border-transparent",
                                isActive
                                  ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                                  : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900",
                              )
                            }
                          >
                            <span
                              className={cn(
                                "size-1 shrink-0 rounded-full",
                                itemStatus === "online" && "bg-emerald-400",
                                itemStatus === "offline" && "bg-red-500",
                                itemStatus === "unknown" && "bg-zinc-700",
                              )}
                              title={
                                itemStatus === "online"
                                  ? "Online"
                                  : itemStatus === "offline"
                                    ? "Offline"
                                    : "Unknown"
                              }
                            />
                            <span className="truncate">
                              {item.name || item.host || item.id}
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
