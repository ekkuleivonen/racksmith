import { useMemo, useState } from "react";
import { Tag } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toastApiError } from "@/lib/api";
import { BulkSearchPopover } from "@/components/canvas/bulk-search-popover";
import { useHosts } from "@/hooks/queries";
import { bulkAddLabel, isManagedHost } from "@/lib/hosts";
import { invalidateResource } from "@/lib/queryClient";
import { useSelection } from "@/stores/selection";

interface BulkAddLabelProps {
  hostIds: string[];
}

export function BulkAddLabel({ hostIds }: BulkAddLabelProps) {
  const [open, setOpen] = useState(false);
  const { data: allHosts = [] } = useHosts();
  const clear = useSelection((s) => s.clear);

  const items = useMemo(() => {
    const set = new Set<string>();
    for (const h of allHosts) {
      if (!isManagedHost(h)) continue;
      for (const l of h.labels ?? []) set.add(l);
    }
    return Array.from(set)
      .sort()
      .map((l) => ({ key: l, label: l }));
  }, [allHosts]);

  const mutation = useMutation({
    mutationFn: (label: string) => bulkAddLabel(hostIds, label),
    onSuccess: () => {
      invalidateResource("hosts");
      clear();
      setOpen(false);
    },
    onError: (err) => toastApiError(err, "Failed to add label"),
  });

  return (
    <BulkSearchPopover
      items={items}
      itemIcon={<Tag className="size-3 text-zinc-500 shrink-0" />}
      placeholder="Search or create label..."
      triggerIcon={<Tag className="size-3" />}
      triggerLabel="Add label"
      busyMessage="Adding label..."
      onSelect={(key) => mutation.mutate(key)}
      onCreate={(search) => mutation.mutate(search)}
      isPending={mutation.isPending}
      open={open}
      onOpenChange={setOpen}
      width="w-56"
    />
  );
}
