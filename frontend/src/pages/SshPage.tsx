import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SshTerminal } from "@/components/ssh-terminal";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getRack, isReachableRackItem, listRacks, type RackDetail, type RackItem } from "@/lib/racks";

type RackItemGroup = {
  rack: RackDetail;
  items: RackItem[];
};

export function SshPage() {
  const [groups, setGroups] = useState<RackItemGroup[]>([]);
  const [selectedValue, setSelectedValue] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const summaries = await listRacks();
        const nextGroups = await Promise.all(
          summaries.map(async (summary) => {
            const data = await getRack(summary.id);
            return { rack: data.rack, items: data.items };
          })
        );
        if (!active) return;
        setGroups(nextGroups);
        const firstReachable =
          nextGroups
            .flatMap((group) =>
              group.items.map((item) => ({
                rackId: group.rack.id,
                item,
              }))
            )
            .find((entry) => isReachableRackItem(entry.item)) ??
          nextGroups.flatMap((group) =>
            group.items.map((item) => ({
              rackId: group.rack.id,
              item,
            }))
          )[0];
        setSelectedValue(
          firstReachable ? `${firstReachable.rackId}:${firstReachable.item.id}` : ""
        );
      } catch (error) {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Failed to load racks");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const options = useMemo(
    () =>
      groups.flatMap((group) =>
        group.items.map((item) => ({
          value: `${group.rack.id}:${item.id}`,
          rack: group.rack,
          item,
        }))
      ),
    [groups]
  );

  const selectedEntry = useMemo(
    () => options.find((option) => option.value === selectedValue) ?? null,
    [options, selectedValue]
  );

  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <p className="text-zinc-500 text-sm">Loading SSH workspace...</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <p className="text-zinc-500 text-sm">No rack items are available for SSH yet.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <div className="space-y-1">
            <h1 className="text-zinc-100 font-semibold">SSH</h1>
            <p className="text-xs text-zinc-500">
              Pick a hardware item from the rack before opening a terminal.
            </p>
          </div>

          <div className="max-w-md space-y-2">
            <p className="text-xs text-zinc-400">Rack hardware item</p>
            <Select value={selectedValue} onValueChange={setSelectedValue}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select hardware item" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectGroup key={group.rack.id}>
                    <SelectLabel>{group.rack.name}</SelectLabel>
                    {group.items.map((item) => (
                      <SelectItem key={item.id} value={`${group.rack.id}:${item.id}`}>
                        {item.name || item.host || item.id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {!selectedEntry ? (
          <section className="border border-zinc-800 bg-zinc-900/30 p-4">
            <p className="text-zinc-500 text-sm">Select a hardware item to continue.</p>
          </section>
        ) : (
          <section className="space-y-3">
            <div className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-zinc-100 font-medium">
                    {selectedEntry.item.name || selectedEntry.item.host || "Unassigned"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {selectedEntry.rack.name} · {selectedEntry.item.position_u_height}U at col{" "}
                    {selectedEntry.item.position_col_start + 1}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedEntry.item.os && <Badge variant="outline">{selectedEntry.item.os}</Badge>}
                </div>
              </div>

              {isReachableRackItem(selectedEntry.item) ? (
                <p className="text-xs text-zinc-400">
                  {selectedEntry.item.ssh_user}@{selectedEntry.item.host}:{selectedEntry.item.ssh_port}
                </p>
              ) : (
                <p className="text-xs text-zinc-500">
                  This item is missing host or SSH user details. Add them in the Rack view first.
                </p>
              )}
            </div>

            {isReachableRackItem(selectedEntry.item) && (
              <SshTerminal rackId={selectedEntry.rack.id} item={selectedEntry.item} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
