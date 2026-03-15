import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useHosts } from "@/hooks/queries";
import { usePingStore } from "@/stores/ping";
import { hostStatusKey } from "@/lib/ssh";
import { compareHosts, hostDisplayLabel, isManagedHost, matchesHostFilters, type Host } from "@/lib/hosts";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { HostStatusDot } from "@/components/shared/host-status-dot";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useSelection } from "@/stores/selection";
import type { CanvasFilters } from "@/hooks/use-canvas-params";

type SortColumn = "name" | "ip" | "user" | "os" | "labels" | "status";
type SortDir = "asc" | "desc";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const STATUS_ORDER: Record<string, number> = { online: 0, unknown: 1, offline: 2 };

function columnComparator(
  col: SortColumn,
  dir: SortDir,
  pingStatuses: Record<string, string>,
): (a: Host, b: Host) => number {
  const m = dir === "asc" ? 1 : -1;
  return (a, b) => {
    let cmp: number;
    switch (col) {
      case "name":
        return m * compareHosts(a, b);
      case "ip":
        cmp = collator.compare(a.ip_address ?? "", b.ip_address ?? "");
        return cmp !== 0 ? m * cmp : compareHosts(a, b);
      case "user":
        cmp = collator.compare(a.ssh_user ?? "", b.ssh_user ?? "");
        return cmp !== 0 ? m * cmp : compareHosts(a, b);
      case "os":
        cmp = collator.compare(a.os_family ?? "", b.os_family ?? "");
        return cmp !== 0 ? m * cmp : compareHosts(a, b);
      case "labels": {
        const al = (a.labels ?? []).slice().sort().join(",");
        const bl = (b.labels ?? []).slice().sort().join(",");
        cmp = collator.compare(al, bl);
        return cmp !== 0 ? m * cmp : compareHosts(a, b);
      }
      case "status": {
        const sa = STATUS_ORDER[pingStatuses[hostStatusKey(a.id)] ?? "unknown"] ?? 1;
        const sb = STATUS_ORDER[pingStatuses[hostStatusKey(b.id)] ?? "unknown"] ?? 1;
        cmp = sa - sb;
        return cmp !== 0 ? m * cmp : compareHosts(a, b);
      }
    }
  };
}

function SortableHead({
  col,
  current,
  dir,
  onSort,
  label,
  className,
}: {
  col: SortColumn;
  current: SortColumn;
  dir: SortDir;
  onSort: (col: SortColumn) => void;
  label?: string;
  className?: string;
}) {
  const active = current === col;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-zinc-100 transition-colors -ml-1 px-1 py-0.5 rounded",
          active ? "text-zinc-100" : "text-zinc-500",
        )}
      >
        {label && <span>{label}</span>}
        <Icon className={cn("size-3 shrink-0", !active && "opacity-0 group-hover/sorthead:opacity-100")} />
      </button>
    </TableHead>
  );
}

interface HostsListViewProps {
  filters: CanvasFilters;
  selectedHostId: string | null;
  onSelectHost: (hostId: string) => void;
}

export function HostsListView({ filters, selectedHostId, onSelectHost }: HostsListViewProps) {
  const { data: allHosts = [] } = useHosts();
  const pingStatuses = usePingStore((s) => s.statuses);
  const selected = useSelection((s) => s.selected);
  const toggle = useSelection((s) => s.toggle);
  const selectAll = useSelection((s) => s.selectAll);
  const clear = useSelection((s) => s.clear);
  const addMany = useSelection((s) => s.addMany);
  const lastClickedRef = useRef<number>(-1);
  const parentRef = useRef<HTMLDivElement>(null);
  const [sortCol, setSortCol] = useState<SortColumn>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback((col: SortColumn) => {
    setSortCol((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortDir("asc");
      }
      return col;
    });
  }, []);

  const hosts = useMemo(() => {
    return allHosts
      .filter(isManagedHost)
      .filter((h) => matchesHostFilters(h, filters, pingStatuses))
      .sort(columnComparator(sortCol, sortDir, pingStatuses));
  }, [allHosts, filters, pingStatuses, sortCol, sortDir]);

  const allSelected = hosts.length > 0 && hosts.every((h) => selected.has(h.id));

  const virtualizer = useVirtualizer({
    count: hosts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  const handleClick = useCallback(
    (e: React.MouseEvent, hostId: string, index: number) => {
      if (e.metaKey || e.ctrlKey) {
        toggle(hostId);
        lastClickedRef.current = index;
        return;
      }
      if (e.shiftKey && lastClickedRef.current >= 0) {
        const from = Math.min(lastClickedRef.current, index);
        const to = Math.max(lastClickedRef.current, index);
        const ids = hosts.slice(from, to + 1).map((h) => h.id);
        addMany(ids);
        return;
      }
      lastClickedRef.current = index;
      onSelectHost(hostId);
    },
    [toggle, addMany, onSelectHost, hosts],
  );

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      clear();
    } else {
      selectAll(hosts.map((h) => h.id));
    }
  }, [hosts, allSelected, selectAll, clear]);

  if (hosts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="text-center space-y-1">
          <p className="text-sm text-zinc-400">No hosts found</p>
          <p className="text-xs text-zinc-600">
            {filters.search || filters.groups.length > 0 || filters.labels.length > 0 || filters.status.length > 0
              ? "Try adjusting your filters."
              : "Add your first host to get started."}
          </p>
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-zinc-950">
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={handleSelectAll}
                className="size-3.5"
              />
            </TableHead>
            <SortableHead col="status" current={sortCol} dir={sortDir} onSort={handleSort} className="w-8" />
            <SortableHead col="name" current={sortCol} dir={sortDir} onSort={handleSort} label="Name" />
            <SortableHead col="ip" current={sortCol} dir={sortDir} onSort={handleSort} label="IP Address" />
            <SortableHead col="user" current={sortCol} dir={sortDir} onSort={handleSort} label="User" />
            <SortableHead col="os" current={sortCol} dir={sortDir} onSort={handleSort} label="OS" />
            <SortableHead col="labels" current={sortCol} dir={sortDir} onSort={handleSort} label="Labels" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {paddingTop > 0 && (
            <tr><td colSpan={7} style={{ height: paddingTop, padding: 0 }} /></tr>
          )}
          {virtualItems.map((virtualRow) => {
            const host = hosts[virtualRow.index];
            const status = pingStatuses[hostStatusKey(host.id)] ?? "unknown";
            const isSelected = host.id === selectedHostId;
            const isMultiSelected = selected.has(host.id);

            return (
              <TableRow
                key={host.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                data-state={isMultiSelected ? "selected" : undefined}
                onClick={(e) => handleClick(e, host.id, virtualRow.index)}
                className={cn(
                  "cursor-pointer",
                  isMultiSelected
                    ? "bg-blue-500/5 hover:bg-blue-500/10"
                    : isSelected
                      ? "bg-emerald-500/5 hover:bg-emerald-500/10"
                      : "",
                )}
              >
                <TableCell>
                  <Checkbox
                    checked={isMultiSelected}
                    className="pointer-events-none size-3.5"
                  />
                </TableCell>
                <TableCell>
                  <HostStatusDot status={status} />
                </TableCell>
                <TableCell className="font-medium text-zinc-100">
                  {hostDisplayLabel(host)}
                </TableCell>
                <TableCell className="font-mono text-zinc-400">
                  {host.ip_address ?? "—"}
                </TableCell>
                <TableCell className="text-zinc-400">
                  {host.ssh_user ?? "—"}
                </TableCell>
                <TableCell>
                  {host.os_family ? (
                    <Badge variant="outline" className="text-[10px]">
                      {host.os_family}
                    </Badge>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(host.labels ?? []).slice(0, 3).map((label) => (
                      <Badge key={label} variant="outline" className="text-[10px]">
                        {label}
                      </Badge>
                    ))}
                    {(host.labels ?? []).length > 3 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{(host.labels ?? []).length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {paddingBottom > 0 && (
            <tr><td colSpan={7} style={{ height: paddingBottom, padding: 0 }} /></tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
