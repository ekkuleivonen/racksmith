import { Globe, Layout, List } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CanvasView } from "@/hooks/use-canvas-params";

interface ViewSwitcherProps {
  view: CanvasView;
  onViewChange: (view: CanvasView) => void;
}

const VIEWS = [
  { value: "list" as const, icon: List, label: "List" },
  { value: "network" as const, icon: Globe, label: "Network" },
  { value: "rack" as const, icon: Layout, label: "Rack" },
];

export function ViewSwitcher({ view, onViewChange }: ViewSwitcherProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center border border-zinc-800 bg-zinc-900/70">
        {VIEWS.map(({ value, icon: Icon, label }) => (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onViewChange(value)}
                className={cn(
                  "flex items-center justify-center px-2 py-1.5 transition-colors",
                  value !== VIEWS[VIEWS.length - 1].value && "border-r border-zinc-800",
                  view === value
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                <Icon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
