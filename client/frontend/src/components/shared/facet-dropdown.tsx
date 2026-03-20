import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FacetItem } from "@/lib/registry";

export function FacetDropdown({
  label,
  icon,
  items,
  selected,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  items: FacetItem[];
  selected: Set<string>;
  onToggle: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = search
    ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Filter by ${label.toLowerCase()}`}
          className="h-8 gap-1.5 border-zinc-800 bg-zinc-900/30 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
        >
          {icon}
          {label}
          {selected.size > 0 && (
            <Badge
              variant="outline"
              className="ml-0.5 h-4 min-w-4 justify-center border-amber-700/50 bg-amber-950/40 px-1 text-[10px] text-amber-300"
            >
              {selected.size}
            </Badge>
          )}
          <ChevronDown className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        {items.length > 6 && (
          <div className="border-b border-zinc-800/50 p-2">
            <Input
              placeholder={`Filter ${label.toLowerCase()}...`}
              aria-label={`Filter ${label.toLowerCase()}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
        )}
        <div className="max-h-56 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-zinc-500">
              No matches
            </p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.name}
                onClick={() => onToggle(item.name)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800/50"
              >
                <Checkbox
                  checked={selected.has(item.name)}
                  className="pointer-events-none size-3.5"
                />
                <span className="flex-1 truncate text-left">{item.name}</span>
                <span className="text-[10px] text-zinc-600">{item.count}</span>
              </button>
            ))
          )}
        </div>
        {selected.size > 0 && (
          <div className="border-t border-zinc-800/50 p-1">
            <button
              onClick={() => {
                for (const name of selected) onToggle(name);
              }}
              className="w-full rounded-sm px-2 py-1.5 text-center text-xs text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
            >
              Clear {label.toLowerCase()}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
