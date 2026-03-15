import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface BulkSearchPopoverProps {
  items: { key: string; label: string }[];
  itemIcon: React.ReactNode;
  placeholder: string;
  triggerIcon: React.ReactNode;
  triggerLabel: string;
  busyMessage: string;
  onSelect: (key: string) => void;
  onCreate: (search: string) => void;
  isPending: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width?: string;
}

export function BulkSearchPopover({
  items,
  itemIcon,
  placeholder,
  triggerIcon,
  triggerLabel,
  busyMessage,
  onSelect,
  onCreate,
  isPending,
  width = "w-60",
  open,
  onOpenChange,
}: BulkSearchPopoverProps) {
  const [search, setSearch] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next) setSearch("");
    onOpenChange(next);
  };

  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes((search ?? "").toLowerCase()),
  );

  const canCreate =
    search.trim().length > 0 &&
    !items.some((i) => i.label.toLowerCase() === search.trim().toLowerCase());

  const handleSelect = (key: string) => {
    if (isPending) return;
    onSelect(key);
  };

  const handleCreate = () => {
    if (isPending || !canCreate) return;
    onCreate(search.trim());
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1.5 text-[11px] border-zinc-700"
        >
          {triggerIcon}
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="top"
        className={`${width} p-0`}
        sideOffset={8}
      >
        <div className="p-2 pb-1">
          <Input
            autoFocus
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) handleCreate();
            }}
          />
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {filtered.length === 0 && !canCreate && (
            <p className="py-4 text-center text-xs text-zinc-500">No items found</p>
          )}
          {filtered.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={isPending}
              onClick={() => handleSelect(item.key)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800/60 disabled:opacity-50"
            >
              {itemIcon}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleCreate}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-emerald-400 transition-colors hover:bg-zinc-800/60 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="size-3 animate-spin shrink-0" />
              ) : (
                <Plus className="size-3 shrink-0" />
              )}
              <span className="truncate">Create "{search.trim()}"</span>
            </button>
          )}
        </div>
        {isPending && (
          <div className="border-t border-zinc-800 px-2 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
            <Loader2 className="size-3 animate-spin" />
            {busyMessage}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
