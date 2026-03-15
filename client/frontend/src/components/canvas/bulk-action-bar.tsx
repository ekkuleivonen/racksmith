import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSelection } from "@/stores/selection";
import { BulkAddToGroup } from "@/components/canvas/bulk-add-to-group";
import { BulkAddLabel } from "@/components/canvas/bulk-add-label";
import { BulkRunPlaybook } from "@/components/canvas/bulk-run-playbook";

export function BulkActionBar() {
  const selected = useSelection((s) => s.selected);
  const clear = useSelection((s) => s.clear);

  if (selected.size === 0) return null;

  const hostIds = Array.from(selected);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900/95 px-4 py-2 shadow-xl backdrop-blur-sm">
      <span className="text-xs text-zinc-300 tabular-nums whitespace-nowrap">
        {selected.size} host{selected.size !== 1 ? "s" : ""} selected
      </span>

      <div className="h-4 w-px bg-zinc-700" />

      <BulkAddToGroup hostIds={hostIds} />
      <BulkAddLabel hostIds={hostIds} />
      <BulkRunPlaybook hostIds={hostIds} />

      <div className="h-4 w-px bg-zinc-700" />

      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
        onClick={clear}
      >
        <X className="size-3" />
        Clear
      </Button>
    </div>
  );
}
