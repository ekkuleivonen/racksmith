import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlaybookRunDialog } from "@/components/playbooks/playbook-run-dialog";
import { useSelection } from "@/stores/selection";

interface BulkRunPlaybookProps {
  hostIds: string[];
}

export function BulkRunPlaybook({ hostIds }: BulkRunPlaybookProps) {
  const [open, setOpen] = useState(false);
  const clear = useSelection((s) => s.clear);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-6 gap-1.5 text-[11px] border-zinc-700"
        onClick={() => setOpen(true)}
      >
        <Play className="size-3" />
        Run playbook
      </Button>

      <PlaybookRunDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) clear();
        }}
        hostIds={hostIds}
      />
    </>
  );
}
