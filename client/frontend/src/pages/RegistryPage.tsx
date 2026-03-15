import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Monitor,
  Package,
  Search,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  usePlaybooks,
  useRecommendedRoles,
  useRegistryFacets,
  useRegistryPlaybookFacets,
  useRegistryPlaybooks,
  useRegistryRoles,
  useRoles,
} from "@/hooks/queries";
import { useSetupStore } from "@/stores/setup";
import type {
  RegistryRole,
  RegistryPlaybook,
  PlatformSpec,
  FacetItem,
  PlaybookContributor,
} from "@/lib/registry";
import { PageContainer } from "@/components/shared/page-container";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useDebouncedValue<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function platformNames(platforms: PlatformSpec[]): string[] {
  return platforms.map((p) =>
    typeof p === "object" && p.name ? p.name : String(p),
  );
}

// ---------------------------------------------------------------------------
// Stacked Avatars
// ---------------------------------------------------------------------------

function StackedAvatars({
  contributors,
  max = 3,
}: {
  contributors: PlaybookContributor[];
  max?: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-1.5">
        {contributors.slice(0, max).map((c) => (
          <img
            key={c.username}
            src={c.avatar_url}
            alt={c.username}
            title={c.username}
            loading="lazy"
            className="size-4 rounded-full ring-1 ring-zinc-950"
          />
        ))}
      </div>
      {contributors.length > max && (
        <span className="text-[10px] text-zinc-500">
          +{contributors.length - max}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role Card
// ---------------------------------------------------------------------------

function RoleCard({
  role,
  imported,
  upgradeAvailable,
}: {
  role: RegistryRole;
  imported: boolean;
  upgradeAvailable?: boolean;
}) {
  const v = role.latest_version;
  const platforms = v?.platforms ? platformNames(v.platforms) : [];

  return (
    <Link to={`/registry/${role.slug}`} className="group block">
      <Card className="h-full border-zinc-800 bg-zinc-950/40 transition-all duration-200 group-hover:border-zinc-600 group-hover:bg-zinc-900/50">
        <CardContent className="flex h-full flex-col p-4">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="flex-1 font-medium leading-tight text-zinc-100">
                {v?.name ?? role.slug}
              </p>
              {upgradeAvailable && (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-1 border-amber-700/50 bg-amber-950/30 text-[10px] text-amber-400"
                >
                  <ArrowUpCircle className="size-2.5" />
                  Update
                </Badge>
              )}
              {imported && !upgradeAvailable && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Check className="size-3.5 shrink-0 text-emerald-400" />
                  </TooltipTrigger>
                  <TooltipContent>Imported</TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-zinc-500">
              {v?.description || "No description"}
            </p>
          </div>

          {(platforms.length > 0 || (v?.tags?.length ?? 0) > 0) && (
            <div className="mt-3 flex flex-wrap gap-1">
              {platforms.slice(0, 3).map((name) => (
                <Badge
                  key={name}
                  variant="outline"
                  className="gap-1 border-sky-800/50 bg-sky-950/30 text-[10px] text-sky-400"
                >
                  <Monitor className="size-2.5" />
                  {name}
                </Badge>
              ))}
              {v?.tags?.slice(0, 4).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-[10px] text-zinc-400"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 border-t border-zinc-800/50 pt-2.5">
            <img
              src={role.owner.avatar_url}
              alt=""
              loading="lazy"
              className="size-4 rounded-full"
            />
            <span className="text-[11px] text-zinc-500">
              {role.owner.username}
            </span>
            <span className="text-[11px] text-zinc-700">&middot;</span>
            <span className="flex items-center gap-0.5 text-[11px] text-zinc-500">
              <Download className="size-2.5" />
              {formatCount(role.download_count + (role.playbook_download_count ?? 0))}
            </span>
            <span className="ml-auto text-[10px] text-zinc-600">
              {timeAgo(role.created_at)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Playbook Card
// ---------------------------------------------------------------------------

function PlaybookCard({
  playbook,
  imported,
  upgradeAvailable,
}: {
  playbook: RegistryPlaybook;
  imported?: boolean;
  upgradeAvailable?: boolean;
}) {
  const v = playbook.latest_version;
  const contributors = v?.contributors ?? [];
  const roleCount = v?.roles?.length ?? 0;

  return (
    <Link
      to={`/registry/playbooks/${playbook.slug}`}
      className="group block"
    >
      <Card className="h-full border-zinc-800 bg-zinc-950/40 transition-all duration-200 group-hover:border-zinc-600 group-hover:bg-zinc-900/50">
        <CardContent className="flex h-full flex-col p-4">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="flex-1 font-medium leading-tight text-zinc-100">
                {v?.name ?? playbook.slug}
              </p>
              {upgradeAvailable && (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-1 border-amber-700/50 bg-amber-950/30 text-[10px] text-amber-400"
                >
                  <ArrowUpCircle className="size-2.5" />
                  Update
                </Badge>
              )}
              {imported && !upgradeAvailable && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Check className="size-3.5 shrink-0 text-emerald-400" />
                  </TooltipTrigger>
                  <TooltipContent>Imported</TooltipContent>
                </Tooltip>
              )}
              {roleCount > 0 && (
                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px] text-zinc-400"
                >
                  {roleCount} {roleCount === 1 ? "role" : "roles"}
                </Badge>
              )}
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-zinc-500">
              {v?.description || "No description"}
            </p>
          </div>

          {(v?.tags?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {v?.tags?.slice(0, 5).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-[10px] text-zinc-400"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 border-t border-zinc-800/50 pt-2.5">
            {contributors.length > 0 ? (
              <StackedAvatars contributors={contributors} />
            ) : (
              <>
                <img
                  src={playbook.owner.avatar_url}
                  alt=""
                  loading="lazy"
                  className="size-4 rounded-full"
                />
                <span className="text-[11px] text-zinc-500">
                  {playbook.owner.username}
                </span>
              </>
            )}
            <span className="text-[11px] text-zinc-700">&middot;</span>
            <span className="flex items-center gap-0.5 text-[11px] text-zinc-500">
              <Download className="size-2.5" />
              {formatCount(playbook.download_count)}
            </span>
            <span className="ml-auto text-[10px] text-zinc-600">
              {timeAgo(playbook.created_at)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Compact card for the recommendations row
// ---------------------------------------------------------------------------

function RecommendedCard({
  role,
  imported,
  upgradeAvailable,
}: {
  role: RegistryRole;
  imported: boolean;
  upgradeAvailable?: boolean;
}) {
  const v = role.latest_version;
  const platforms = v?.platforms ? platformNames(v.platforms) : [];

  return (
    <Link
      to={`/registry/${role.slug}`}
      className="group block w-[280px] shrink-0"
    >
      <Card className="h-full border-zinc-800 bg-zinc-950/40 transition-all duration-200 group-hover:border-amber-700/50 group-hover:bg-zinc-900/50">
        <CardContent className="flex h-full flex-col p-3.5">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <p className="flex-1 truncate text-sm font-medium text-zinc-100">
                {v?.name ?? role.slug}
              </p>
              {upgradeAvailable && (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-0.5 border-amber-700/50 bg-amber-950/30 px-1 text-[9px] text-amber-400"
                >
                  <ArrowUpCircle className="size-2" />
                  Update
                </Badge>
              )}
              {imported && !upgradeAvailable && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Check className="size-3 shrink-0 text-emerald-400" />
                  </TooltipTrigger>
                  <TooltipContent>Imported</TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
              {v?.description || "No description"}
            </p>
          </div>

          {platforms.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {platforms.slice(0, 2).map((name) => (
                <Badge
                  key={name}
                  variant="outline"
                  className="gap-1 border-sky-800/50 bg-sky-950/30 text-[9px] text-sky-400"
                >
                  <Monitor className="size-2" />
                  {name}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-2 border-t border-zinc-800/50 pt-2">
            <img
              src={role.owner.avatar_url}
              alt=""
              loading="lazy"
              className="size-3.5 rounded-full"
            />
            <span className="text-[10px] text-zinc-500">
              {role.owner.username}
            </span>
            <span className="text-[10px] text-zinc-700">&middot;</span>
            <span className="flex items-center gap-0.5 text-[10px] text-zinc-500">
              <Download className="size-2.5" />
              {formatCount(role.download_count + (role.playbook_download_count ?? 0))}
            </span>
            <span className="ml-auto text-[10px] text-zinc-600">
              {timeAgo(role.created_at)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Multi-select dropdown filter
// ---------------------------------------------------------------------------

function FacetDropdown({
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

// ---------------------------------------------------------------------------
// Roles Tab Content
// ---------------------------------------------------------------------------

function RolesTabContent() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const [sort, setSort] = useState<
    "recent" | "downloads" | "name" | "relevance"
  >("recent");
  const [page, setPage] = useState(1);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(),
  );
  const perPage = 20;

  const effectiveSort = debouncedQ && sort === "recent" ? "relevance" : sort;

  const tagsParam = useMemo(
    () => (selectedTags.size ? [...selectedTags].join(",") : undefined),
    [selectedTags],
  );
  const platformsParam = useMemo(
    () =>
      selectedPlatforms.size
        ? [...selectedPlatforms].join(",")
        : undefined,
    [selectedPlatforms],
  );

  const { data, isLoading, isError } = useRegistryRoles({
    q: debouncedQ || undefined,
    tags: tagsParam,
    platforms: platformsParam,
    sort: effectiveSort,
    page,
    per_page: perPage,
  });

  const { data: facets } = useRegistryFacets();
  const { data: recommended } = useRecommendedRoles();
  const { data: localRoles } = useRoles();

  const importedIds = useMemo(
    () =>
      new Set((localRoles ?? []).map((r) => r.registry_id).filter(Boolean)),
    [localRoles],
  );

  const localVersionBySlug = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of localRoles ?? []) {
      if (r.registry_id && r.registry_version)
        m.set(r.registry_id, r.registry_version);
    }
    return m;
  }, [localRoles]);

  const hasActiveFilters = selectedTags.size > 0 || selectedPlatforms.size > 0;

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    setPage(1);
  }

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
    setPage(1);
  }

  function clearFilters() {
    setSelectedTags(new Set());
    setSelectedPlatforms(new Set());
    setPage(1);
  }

  return (
    <div className="space-y-5">
      {/* Recommended for your infrastructure */}
      {recommended && recommended.items.length > 0 && (
        <section className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-900/20 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-amber-400" />
            <h2 className="text-xs font-medium text-zinc-300">
              Recommended for your infrastructure
            </h2>
          </div>
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-2">
              {recommended.items.map((role) => {
                const localVer = localVersionBySlug.get(role.slug);
                const regVer = role.latest_version?.version_number;
                return (
                  <RecommendedCard
                    key={role.id}
                    role={role}
                    imported={importedIds.has(role.slug)}
                    upgradeAvailable={
                      localVer != null &&
                      regVer != null &&
                      regVer > localVer
                    }
                  />
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </section>
      )}

      {/* Search + Sort + Filters */}
      <section className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-900/20 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              placeholder="Search roles..."
              aria-label="Search roles"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>

          {facets && facets.platforms.length > 0 && (
            <FacetDropdown
              label="Platform"
              icon={<Monitor className="size-3" />}
              items={facets.platforms}
              selected={selectedPlatforms}
              onToggle={togglePlatform}
            />
          )}
          {facets && facets.tags.length > 0 && (
            <FacetDropdown
              label="Tags"
              icon={<Tag className="size-3" />}
              items={facets.tags}
              selected={selectedTags}
              onToggle={toggleTag}
            />
          )}

          <Select
            value={sort}
            onValueChange={(v) => {
              setSort(
                v as "recent" | "downloads" | "name" | "relevance",
              );
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="downloads">Downloads</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              {debouncedQ && (
                <SelectItem value="relevance">Relevance</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {[...selectedPlatforms].map((p) => (
              <Badge
                key={`p-${p}`}
                variant="outline"
                className="cursor-pointer gap-1 border-sky-800/50 bg-sky-950/30 text-[10px] text-sky-400"
                onClick={() => togglePlatform(p)}
              >
                <Monitor className="size-2.5" />
                {p}
                <X className="size-2.5" />
              </Badge>
            ))}
            {[...selectedTags].map((t) => (
              <Badge
                key={`t-${t}`}
                variant="outline"
                className="cursor-pointer gap-1 border-amber-800/50 bg-amber-950/30 text-[10px] text-amber-400"
                onClick={() => toggleTag(t)}
              >
                {t}
                <X className="size-2.5" />
              </Badge>
            ))}
            <button
              onClick={clearFilters}
              className="ml-1 text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              Clear all
            </button>
          </div>
        )}

        <Separator className="bg-zinc-800/50" />

        {isError ? (
          <div className="flex flex-col items-center gap-2 py-12">
            <AlertTriangle className="size-8 text-red-400" />
            <p className="text-sm text-zinc-400">
              Failed to load roles from the registry.
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-zinc-500" role="status" aria-live="polite">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Searching registry...</span>
          </div>
        ) : data?.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12">
            <Search className="size-8 text-zinc-700" />
            <p className="text-sm text-zinc-500">
              No roles found. Try a different search or filter.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data?.items.map((role) => {
              const localVer = localVersionBySlug.get(role.slug);
              const regVer = role.latest_version?.version_number;
              return (
                <RoleCard
                  key={role.id}
                  role={role}
                  imported={importedIds.has(role.slug)}
                  upgradeAvailable={
                    localVer != null &&
                    regVer != null &&
                    regVer > localVer
                  }
                />
              );
            })}
          </div>
        )}

        {data && data.total > perPage && (
          <nav className="flex items-center justify-between pt-1" aria-label="Roles pagination">
            <p className="text-[11px] text-zinc-600">
              Showing {(page - 1) * perPage + 1}&ndash;
              {Math.min(page * perPage, data.total)} of {data.total}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 w-7 p-0"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="px-2 text-[11px] text-zinc-400">{page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page * perPage >= data.total}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 w-7 p-0"
                aria-label="Next page"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playbooks Tab Content
// ---------------------------------------------------------------------------

function PlaybooksTabContent() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const [sort, setSort] = useState<
    "recent" | "downloads" | "name" | "relevance"
  >("recent");
  const [page, setPage] = useState(1);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const perPage = 20;

  const effectiveSort = debouncedQ && sort === "recent" ? "relevance" : sort;

  const tagsParam = useMemo(
    () => (selectedTags.size ? [...selectedTags].join(",") : undefined),
    [selectedTags],
  );

  const { data, isLoading, isError } = useRegistryPlaybooks({
    q: debouncedQ || undefined,
    tags: tagsParam,
    sort: effectiveSort,
    page,
    per_page: perPage,
  });

  const { data: facets } = useRegistryPlaybookFacets();
  const { data: localPlaybooks } = usePlaybooks();

  const importedSlugs = useMemo(
    () =>
      new Set(
        (localPlaybooks ?? []).map((p) => p.registry_id).filter(Boolean),
      ),
    [localPlaybooks],
  );

  const localPbVersionBySlug = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of localPlaybooks ?? []) {
      if (p.registry_id && p.registry_version)
        m.set(p.registry_id, p.registry_version);
    }
    return m;
  }, [localPlaybooks]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    setPage(1);
  }

  return (
    <section className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-900/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Search playbooks..."
            aria-label="Search playbooks"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="pl-8"
          />
        </div>

        {facets && facets.tags.length > 0 && (
          <FacetDropdown
            label="Tags"
            icon={<Tag className="size-3" />}
            items={facets.tags}
            selected={selectedTags}
            onToggle={toggleTag}
          />
        )}

        <Select
          value={sort}
          onValueChange={(v) => {
            setSort(v as "recent" | "downloads" | "name" | "relevance");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recent</SelectItem>
            <SelectItem value="downloads">Downloads</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            {debouncedQ && (
              <SelectItem value="relevance">Relevance</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {selectedTags.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {[...selectedTags].map((t) => (
            <Badge
              key={`t-${t}`}
              variant="outline"
              className="cursor-pointer gap-1 border-amber-800/50 bg-amber-950/30 text-[10px] text-amber-400"
              onClick={() => toggleTag(t)}
            >
              {t}
              <X className="size-2.5" />
            </Badge>
          ))}
          <button
            onClick={() => {
              setSelectedTags(new Set());
              setPage(1);
            }}
            className="ml-1 text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            Clear all
          </button>
        </div>
      )}

      <Separator className="bg-zinc-800/50" />

      {isError ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <AlertTriangle className="size-8 text-red-400" />
          <p className="text-sm text-zinc-400">
            Failed to load playbooks from the registry.
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-zinc-500" role="status" aria-live="polite">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">Searching registry...</span>
        </div>
      ) : data?.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <Search className="size-8 text-zinc-700" />
          <p className="text-sm text-zinc-500">
            No playbooks found. Try a different search or filter.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data?.items.map((pb) => {
            const localVer = localPbVersionBySlug.get(pb.slug);
            const regVer = pb.latest_version?.version_number;
            return (
              <PlaybookCard
                key={pb.id}
                playbook={pb}
                imported={importedSlugs.has(pb.slug)}
                upgradeAvailable={
                  localVer != null &&
                  regVer != null &&
                  regVer > localVer
                }
              />
            );
          })}
        </div>
      )}

      {data && data.total > perPage && (
        <nav className="flex items-center justify-between pt-1" aria-label="Playbooks pagination">
          <p className="text-[11px] text-zinc-600">
            Showing {(page - 1) * perPage + 1}&ndash;
            {Math.min(page * perPage, data.total)} of {data.total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 w-7 p-0"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="px-2 text-[11px] text-zinc-400">{page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * perPage >= data.total}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 w-7 p-0"
              aria-label="Next page"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </nav>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// My Packages Tab Content
// ---------------------------------------------------------------------------

function MyPackagesTabContent() {
  const currentUserLogin = useSetupStore((s) => s.status?.user?.login);
  const { data: localRoles } = useRoles();
  const { data: localPlaybooks } = usePlaybooks();

  const { data: myRoles, isLoading: rolesLoading } = useRegistryRoles(
    currentUserLogin
      ? { owner: currentUserLogin, per_page: 100 }
      : { per_page: 0 },
  );
  const { data: myPlaybooks, isLoading: playbooksLoading } =
    useRegistryPlaybooks(
      currentUserLogin
        ? { owner: currentUserLogin, per_page: 100 }
        : { per_page: 0 },
    );

  const importedRoleSlugs = useMemo(
    () =>
      new Set((localRoles ?? []).map((r) => r.registry_id).filter(Boolean)),
    [localRoles],
  );
  const roleVersionBySlug = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of localRoles ?? []) {
      if (r.registry_id && r.registry_version)
        m.set(r.registry_id, r.registry_version);
    }
    return m;
  }, [localRoles]);

  const importedPbSlugs = useMemo(
    () =>
      new Set(
        (localPlaybooks ?? []).map((p) => p.registry_id).filter(Boolean),
      ),
    [localPlaybooks],
  );
  const pbVersionBySlug = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of localPlaybooks ?? []) {
      if (p.registry_id && p.registry_version)
        m.set(p.registry_id, p.registry_version);
    }
    return m;
  }, [localPlaybooks]);

  const isLoading = rolesLoading || playbooksLoading;
  const roles = myRoles?.items ?? [];
  const playbooks = myPlaybooks?.items ?? [];
  const isEmpty = roles.length === 0 && playbooks.length === 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-zinc-500">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Loading your packages...</span>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <Package className="size-8 text-zinc-700" />
        <p className="text-sm text-zinc-500">
          You haven&apos;t published any packages yet.
        </p>
        <p className="text-xs text-zinc-600">
          Push a role or playbook to the registry to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {roles.length > 0 && (
        <section className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-900/20 p-4">
          <h2 className="text-xs font-medium text-zinc-300">
            My Roles ({roles.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {roles.map((role) => {
              const localVer = roleVersionBySlug.get(role.slug);
              const regVer = role.latest_version?.version_number;
              return (
                <RoleCard
                  key={role.id}
                  role={role}
                  imported={importedRoleSlugs.has(role.slug)}
                  upgradeAvailable={
                    localVer != null && regVer != null && regVer > localVer
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {playbooks.length > 0 && (
        <section className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-900/20 p-4">
          <h2 className="text-xs font-medium text-zinc-300">
            My Playbooks ({playbooks.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {playbooks.map((pb) => {
              const localVer = pbVersionBySlug.get(pb.slug);
              const regVer = pb.latest_version?.version_number;
              return (
                <PlaybookCard
                  key={pb.id}
                  playbook={pb}
                  imported={importedPbSlugs.has(pb.slug)}
                  upgradeAvailable={
                    localVer != null && regVer != null && regVer > localVer
                  }
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function RegistryPage() {
  return (
    <PageContainer>
      <div className="space-y-5">
        <section className="space-y-1">
          <h1 className="text-lg font-semibold text-zinc-100">Registry</h1>
          <p className="text-xs text-zinc-500">
            Discover and import community roles and playbooks for your
            infrastructure.
          </p>
        </section>

        <Tabs defaultValue="roles">
          <TabsList className="bg-zinc-900/50">
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="playbooks">Playbooks</TabsTrigger>
            <TabsTrigger value="my-packages">My Packages</TabsTrigger>
          </TabsList>
          <TabsContent value="roles" className="mt-4">
            <RolesTabContent />
          </TabsContent>
          <TabsContent value="playbooks" className="mt-4">
            <PlaybooksTabContent />
          </TabsContent>
          <TabsContent value="my-packages" className="mt-4">
            <MyPackagesTabContent />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
