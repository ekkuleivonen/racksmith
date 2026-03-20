import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  Loader2,
  Monitor,
  Package,
  Star,
  Tag,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityListPage } from "@/components/shared/entity-list-page";
import { FacetDropdown } from "@/components/shared/facet-dropdown";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useRegistryRoles, useRegistryFacets, useRoles } from "@/hooks/queries";
import { usePushToRegistry } from "@/hooks/mutations";
import { usePinsStore } from "@/stores/pins";
import { useSetupStore } from "@/stores/setup";
import type { RoleSummary } from "@/lib/roles";
import type { FacetItem, RegistryRole } from "@/lib/registry";

function useRepoKey() {
  const status = useSetupStore((s) => s.status);
  return status ? `${status.user.login}/${status.repo?.full_name ?? ""}` : "";
}

function PinButton({ path, label }: { path: string; label: string }) {
  const repoKey = useRepoKey();
  const isPinned = usePinsStore((s) => s.isPinned(repoKey, path));
  const togglePin = usePinsStore((s) => s.togglePin);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePin(repoKey, path, label);
      }}
      title={isPinned ? "Unpin" : "Pin to sidebar"}
      className="h-7 w-7 p-0 shrink-0"
    >
      <Star
        className={`size-3.5 ${isPinned ? "fill-amber-400 text-amber-400" : "text-zinc-500"}`}
      />
    </Button>
  );
}

function PushButton({ roleId }: { roleId: string }) {
  const pushMutation = usePushToRegistry();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        pushMutation.mutate(roleId, {
          onSuccess: () => toast.success("Role pushed to registry"),
        });
      }}
      disabled={pushMutation.isPending}
      title="Push to registry"
    >
      {pushMutation.isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Upload className="size-3.5" />
      )}
      Push
    </Button>
  );
}

function buildFacets(roles: RoleSummary[]) {
  const labelCounts = new Map<string, number>();
  const platformCounts = new Map<string, number>();

  for (const r of roles) {
    for (const l of r.labels) {
      labelCounts.set(l, (labelCounts.get(l) ?? 0) + 1);
    }
    for (const os of r.compatibility?.os_family ?? []) {
      platformCounts.set(os, (platformCounts.get(os) ?? 0) + 1);
    }
  }

  const labelFacets: FacetItem[] = [...labelCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const platformFacets: FacetItem[] = [...platformCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { labelFacets, platformFacets };
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function RegistryRoleCard({ role }: { role: RegistryRole }) {
  const v = role.latest_version;

  return (
    <Link
      to={`/registry/${role.id}`}
      className="flex items-center justify-between gap-4 rounded border border-zinc-800/60 border-dashed bg-zinc-950/20 px-4 py-3 transition-colors hover:border-zinc-700"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-zinc-100">
            {v?.name ?? role.id}
          </span>
          <Badge
            variant="outline"
            className="text-[10px] gap-1 border-sky-800/50 bg-sky-950/30 text-sky-400"
          >
            <Package className="size-2.5" />
            Registry
          </Badge>
        </div>
        {v?.description && (
          <p className="text-xs text-zinc-500 line-clamp-1">
            {v.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-zinc-500 shrink-0">
        <span className="flex items-center gap-0.5">
          <Download className="size-2.5" />
          {formatCount(role.download_count + (role.playbook_download_count ?? 0))}
        </span>
        <img
          src={role.owner.avatar_url}
          alt=""
          loading="lazy"
          className="size-4 rounded-full"
        />
        <span>{role.owner.username}</span>
      </div>
    </Link>
  );
}

export function RolesPage() {
  const { data: roles = [], isLoading } = useRoles();
  const [search, setSearch] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());

  const debouncedSearch = useDebouncedValue(search, 300);

  const { labelFacets, platformFacets } = useMemo(
    () => buildFacets(roles),
    [roles],
  );

  const hasActiveFilters = selectedLabels.size > 0 || selectedPlatforms.size > 0;
  const hasSearchOrFilters = !!debouncedSearch.trim() || hasActiveFilters;

  const filtered = useMemo(() => {
    let result = roles;
    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.labels.some((l) => l.toLowerCase().includes(q)),
      );
    }
    if (selectedLabels.size > 0) {
      result = result.filter((r) =>
        r.labels.some((l) => selectedLabels.has(l)),
      );
    }
    if (selectedPlatforms.size > 0) {
      result = result.filter((r) =>
        (r.compatibility?.os_family ?? []).some((os) => selectedPlatforms.has(os)),
      );
    }
    return result;
  }, [roles, search, selectedLabels, selectedPlatforms]);

  const tagsParam = useMemo(
    () => (selectedLabels.size ? [...selectedLabels].join(",") : undefined),
    [selectedLabels],
  );
  const platformsParam = useMemo(
    () => (selectedPlatforms.size ? [...selectedPlatforms].join(",") : undefined),
    [selectedPlatforms],
  );

  const { data: registryData, isLoading: registryLoading } = useRegistryRoles(
    hasSearchOrFilters
      ? {
          q: debouncedSearch.trim() || undefined,
          tags: tagsParam,
          platforms: platformsParam,
          per_page: 6,
          sort: debouncedSearch.trim() ? "relevance" : "downloads",
        }
      : { per_page: 0 },
  );

  const { data: registryFacets } = useRegistryFacets();

  const localRegistryIds = useMemo(
    () => new Set(roles.map((r) => r.registry_id).filter(Boolean)),
    [roles],
  );

  const registryResults = useMemo(
    () =>
      (registryData?.items ?? []).filter(
        (r) => !localRegistryIds.has(r.id),
      ),
    [registryData, localRegistryIds],
  );

  function toggleLabel(label: string) {
    setSelectedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  function clearFilters() {
    setSelectedLabels(new Set());
    setSelectedPlatforms(new Set());
  }

  const combinedLabelFacets = useMemo(() => {
    const merged = new Map<string, number>();
    for (const f of labelFacets) merged.set(f.name, f.count);
    for (const f of registryFacets?.tags ?? []) {
      if (!merged.has(f.name)) merged.set(f.name, 0);
    }
    return [...merged.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [labelFacets, registryFacets]);

  const combinedPlatformFacets = useMemo(() => {
    const merged = new Map<string, number>();
    for (const f of platformFacets) merged.set(f.name, f.count);
    for (const f of registryFacets?.platforms ?? []) {
      if (!merged.has(f.name)) merged.set(f.name, 0);
    }
    return [...merged.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [platformFacets, registryFacets]);

  const filterBar = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {combinedPlatformFacets.length > 0 && (
          <FacetDropdown
            label="Platform"
            icon={<Monitor className="size-3" />}
            items={combinedPlatformFacets}
            selected={selectedPlatforms}
            onToggle={togglePlatform}
          />
        )}
        {combinedLabelFacets.length > 0 && (
          <FacetDropdown
            label="Labels"
            icon={<Tag className="size-3" />}
            items={combinedLabelFacets}
            selected={selectedLabels}
            onToggle={toggleLabel}
          />
        )}
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
          {[...selectedLabels].map((t) => (
            <Badge
              key={`t-${t}`}
              variant="outline"
              className="cursor-pointer gap-1 border-amber-800/50 bg-amber-950/30 text-[10px] text-amber-400"
              onClick={() => toggleLabel(t)}
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
    </>
  );

  const registrySection =
    hasSearchOrFilters && registryResults.length > 0 ? (
      <section className="border border-zinc-800/60 border-dashed bg-zinc-900/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Package className="size-3.5 text-sky-400" />
          <h2 className="text-xs font-medium text-zinc-400">
            From Registry
          </h2>
          <span className="text-[10px] text-zinc-600">
            {registryResults.length} result{registryResults.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="space-y-2">
          {registryResults.map((role) => (
            <RegistryRoleCard key={role.id} role={role} />
          ))}
        </div>
      </section>
    ) : hasSearchOrFilters && registryLoading ? (
      <section className="border border-zinc-800/60 border-dashed bg-zinc-900/20 p-4">
        <div className="flex items-center gap-2 text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" />
          <span className="text-xs">Searching registry...</span>
        </div>
      </section>
    ) : null;

  return (
    <EntityListPage
      title="Roles"
      description="Ansible roles in your repository. Create new ones or push existing roles to the community registry."
      createPath="/roles/create"
      createLabel="Create"
      isLoading={isLoading}
      isEmpty={filtered.length === 0}
      emptyTitle={hasSearchOrFilters ? "No local roles match your filters." : "No roles yet."}
      emptySecondaryAction={hasSearchOrFilters ? undefined : { label: "Import from registry", path: "/registry" }}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Filter by name, description, or label..."
      filterBar={filterBar}
      afterContent={registrySection}
    >
      <div className="space-y-2">
        {filtered.map((role: RoleSummary) => (
          <Link
            key={role.id}
            to={`/roles/${role.id}`}
            className="flex items-center justify-between gap-4 rounded border border-zinc-800 bg-zinc-950/40 px-4 py-3 transition-colors hover:border-zinc-700"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-zinc-100">
                  {role.name}
                </span>
                <span className="text-[11px] text-zinc-600 font-mono">
                  {role.id}
                </span>
              </div>
              {role.description && (
                <p className="text-xs text-zinc-500 line-clamp-1">
                  {role.description}
                </p>
              )}
              {role.labels.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {role.labels.slice(0, 5).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px]"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <PinButton path={`/roles/${role.id}`} label={role.name} />
              <PushButton roleId={role.id} />
            </div>
          </Link>
        ))}
      </div>
    </EntityListPage>
  );
}
