import { type ComponentType, useEffect, useMemo, useState } from "react";
import { CircleDot, Network, Search, SlidersHorizontal, Tag, Users, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useGroups, useHosts, useSubnets } from "@/hooks/queries";
import { isManagedHost, matchesCanvasHostFilters } from "@/lib/hosts";
import { usePingStore } from "@/stores/ping";
import { cn } from "@/lib/utils";
import type { CanvasActions, CanvasFilters } from "@/hooks/use-canvas-params";

interface FilterBarProps {
  filters: CanvasFilters;
  actions: Pick<CanvasActions, "setFilter" | "setSearch" | "clearFilters">;
}

const STATUS_OPTIONS = [
  { value: "online", label: "Online", dotClass: "bg-emerald-400" },
  { value: "offline", label: "Offline", dotClass: "bg-red-500" },
  { value: "unknown", label: "Unknown", dotClass: "bg-zinc-600" },
] as const;

interface FilterSectionProps {
  label: string;
  icon: ComponentType<{ className?: string }>;
  options: { value: string; label: string; dot?: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}

function FilterSection({ label, icon: Icon, options, selected, onChange }: FilterSectionProps) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  if (options.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 px-2 pt-1">
        <Icon className="size-3 text-zinc-500" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="ml-auto text-[10px] text-zinc-600 hover:text-zinc-400"
          >
            Clear
          </button>
        )}
      </div>
      {options.length > 6 && (
        <div className="px-2">
          <Input
            placeholder={`Search ${label.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-6 text-[11px]"
          />
        </div>
      )}
      <div className="max-h-32 overflow-y-auto px-1">
        {filtered.length === 0 && (
          <p className="py-2 text-center text-[11px] text-zinc-600">No results</p>
        )}
        {filtered.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[11px] transition-colors hover:bg-zinc-800/60"
            >
              <Checkbox checked={isSelected} className="pointer-events-none size-3" />
              {option.dot && <span className={cn("size-1.5 shrink-0 rounded-full", option.dot)} />}
              <span className={cn("truncate", isSelected ? "text-zinc-100" : "text-zinc-400")}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FilterBar({ filters, actions }: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);
  const { data: groups = [] } = useGroups();
  const { data: allHosts = [] } = useHosts();
  const { data: subnetMetas = [] } = useSubnets();
  const pingStatuses = usePingStore((s) => s.statuses);

  const managedHosts = useMemo(() => allHosts.filter(isManagedHost), [allHosts]);

  const allLabels = useMemo(
    () => Array.from(new Set(managedHosts.flatMap((h) => h.labels ?? []))).sort(),
    [managedHosts],
  );

  const subnetMetaMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of subnetMetas) {
      if (s.name) m.set(s.cidr, s.name);
    }
    return m;
  }, [subnetMetas]);

  const subnetOptions = useMemo(() => {
    const cidrs = new Set<string>();
    for (const h of managedHosts) {
      if (h.subnet) cidrs.add(h.subnet);
    }
    for (const s of subnetMetas) {
      cidrs.add(s.cidr);
    }
    return [...cidrs]
      .sort()
      .map((cidr) => ({ value: cidr, label: subnetMetaMap.get(cidr) ?? cidr }));
  }, [managedHosts, subnetMetaMap, subnetMetas]);

  const filteredCount = useMemo(
    () =>
      managedHosts.filter((host) =>
        matchesCanvasHostFilters(host, filters, pingStatuses),
      ).length,
    [managedHosts, filters, pingStatuses],
  );

  useEffect(() => {
    const timer = setTimeout(() => actions.setSearch(localSearch), 200);
    return () => clearTimeout(timer);
  }, [localSearch, actions]);

  const [prevSearch, setPrevSearch] = useState(filters.search);
  if (prevSearch !== filters.search) {
    setPrevSearch(filters.search);
    setLocalSearch(filters.search);
  }

  const activeFilterCount =
    filters.groups.length + filters.labels.length + filters.status.length + filters.subnets.length;

  const hasActiveFilters = activeFilterCount > 0 || filters.search.length > 0;

  const groupOptions = useMemo(
    () => groups.map((g) => ({ value: g.id, label: g.name || g.id })),
    [groups],
  );
  const labelOptions = useMemo(
    () => allLabels.map((l) => ({ value: l, label: l })),
    [allLabels],
  );
  const statusOptions = STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label, dot: o.dotClass }));

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-zinc-500" />
        <Input
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search hosts..."
          className="h-7 w-44 pl-7 text-xs"
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-7 gap-1.5 rounded-none border-zinc-800 text-[11px]",
              activeFilterCount > 0 ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <SlidersHorizontal className="size-3" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex size-4 items-center justify-center rounded-sm bg-zinc-700 text-[9px] font-medium text-zinc-200">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0" sideOffset={6}>
          <div className="divide-y divide-zinc-800/60 py-1">
            <FilterSection
              label="Status"
              icon={CircleDot}
              options={statusOptions}
              selected={filters.status}
              onChange={(v) => actions.setFilter("status", v)}
            />
            {groupOptions.length > 0 && (
              <FilterSection
                label="Groups"
                icon={Users}
                options={groupOptions}
                selected={filters.groups}
                onChange={(v) => actions.setFilter("groups", v)}
              />
            )}
            {labelOptions.length > 0 && (
              <FilterSection
                label="Labels"
                icon={Tag}
                options={labelOptions}
                selected={filters.labels}
                onChange={(v) => actions.setFilter("labels", v)}
              />
            )}
            {subnetOptions.length > 0 && (
              <FilterSection
                label="Subnet"
                icon={Network}
                options={subnetOptions}
                selected={filters.subnets}
                onChange={(v) => actions.setFilter("subnets", v)}
              />
            )}
          </div>
          {activeFilterCount > 0 && (
            <div className="border-t border-zinc-800 p-1">
              <button
                type="button"
                onClick={actions.clearFilters}
                className="flex w-full items-center justify-center gap-1 px-2 py-1.5 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
              >
                <X className="size-3" />
                Clear all filters
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="mx-0.5 h-4" />

      <span className="whitespace-nowrap text-[11px] tabular-nums text-zinc-500">
        {hasActiveFilters && filteredCount !== managedHosts.length
          ? `${filteredCount} of ${managedHosts.length} hosts`
          : `${managedHosts.length} hosts`}
      </span>
    </div>
  );
}
