import { useState } from "react";
import { Users } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toastApiError } from "@/lib/api";
import { BulkSearchPopover } from "@/components/canvas/bulk-search-popover";
import { useGroups } from "@/hooks/queries";
import { bulkAddToGroup } from "@/lib/hosts";
import { createGroup } from "@/lib/groups";
import { invalidateResource } from "@/lib/queryClient";
import { useSelection } from "@/stores/selection";

interface BulkAddToGroupProps {
  hostIds: string[];
}

export function BulkAddToGroup({ hostIds }: BulkAddToGroupProps) {
  const [open, setOpen] = useState(false);
  const { data: groups = [] } = useGroups();
  const clear = useSelection((s) => s.clear);

  const onSuccess = () => {
    invalidateResource("hosts", "groups");
    clear();
    setOpen(false);
  };

  const addMutation = useMutation({
    mutationFn: (groupId: string) => bulkAddToGroup(hostIds, groupId),
    onSuccess,
    onError: (err) => toastApiError(err, "Failed to add to group"),
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const { group } = await createGroup({ name });
      await bulkAddToGroup(hostIds, group.id);
    },
    onSuccess,
    onError: (err) => toastApiError(err, "Failed to create group"),
  });

  const isPending = addMutation.isPending || createMutation.isPending;

  return (
    <BulkSearchPopover
      items={groups.map((g) => ({ key: g.id, label: g.name || g.id }))}
      itemIcon={<Users className="size-3 text-zinc-500 shrink-0" />}
      placeholder="Search or create group..."
      triggerIcon={<Users className="size-3" />}
      triggerLabel="Add to group"
      busyMessage="Adding to group..."
      onSelect={(key) => addMutation.mutate(key)}
      onCreate={(search) => createMutation.mutate(search)}
      isPending={isPending}
      open={open}
      onOpenChange={setOpen}
      width="w-60"
    />
  );
}
