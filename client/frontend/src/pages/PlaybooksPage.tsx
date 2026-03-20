import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Loader2, Package, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toastApiError } from "@/lib/api";
import { EntityListPage } from "@/components/shared/entity-list-page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useRegistryPlaybooks, usePlaybooks } from "@/hooks/queries";
import { usePinsStore } from "@/stores/pins";
import { useSetupStore } from "@/stores/setup";
import type { PlaybookSummary } from "@/lib/playbooks";
import { listPlaybooks } from "@/lib/playbooks";
import type { RegistryPlaybook } from "@/lib/registry";

function useRepoKey() {
  const status = useSetupStore((s) => s.status);
  return status ? `${status.user.login}/${status.repo?.full_name ?? ""}` : "";
}

function PinButton({ path, label }: { path: string; label: string }) {
  const repoKey = useRepoKey();
  const isPinned = usePinsStore((s) => (s.pins[repoKey] ?? []).some((p) => p.path === path));
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

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function RegistryPlaybookCard({ playbook }: { playbook: RegistryPlaybook }) {
  const v = playbook.latest_version;
  const roleCount = v?.roles?.length ?? 0;

  return (
    <button
      type="button"
      className="w-full border border-zinc-800/60 border-dashed bg-zinc-950/20 p-3 text-left hover:border-zinc-700 transition-colors"
      onClick={() => {
        window.location.href = `/registry/playbooks/${playbook.id}`;
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm text-zinc-100">{v?.name ?? playbook.id}</p>
            <Badge
              variant="outline"
              className="text-[10px] gap-1 border-sky-800/50 bg-sky-950/30 text-sky-400"
            >
              <Package className="size-2.5" />
              Registry
            </Badge>
          </div>
          {v?.description && (
            <p className="text-xs text-zinc-400 line-clamp-1">{v.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500 shrink-0">
          {roleCount > 0 && (
            <span>{roleCount} roles</span>
          )}
          <span className="flex items-center gap-0.5">
            <Download className="size-2.5" />
            {formatCount(playbook.download_count)}
          </span>
        </div>
      </div>
    </button>
  );
}

export function PlaybooksPage() {
  const navigate = useNavigate();
  const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const debouncedSearch = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPlaybooks();
      setPlaybooks(data.playbooks);
    } catch (error) {
      toastApiError(error, "Failed to load playbooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return playbooks;
    return playbooks.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q),
    );
  }, [playbooks, search]);

  const hasSearch = !!debouncedSearch.trim();

  const { data: registryData, isLoading: registryLoading } = useRegistryPlaybooks(
    hasSearch
      ? {
          q: debouncedSearch.trim(),
          per_page: 6,
          sort: "relevance",
        }
      : { per_page: 0 },
  );

  const { data: localPlaybooksFromHook } = usePlaybooks();
  const localRegistryIds = useMemo(
    () => new Set((localPlaybooksFromHook ?? playbooks).map((p) => p.registry_id).filter(Boolean)),
    [localPlaybooksFromHook, playbooks],
  );

  const registryResults = useMemo(
    () =>
      (registryData?.items ?? []).filter(
        (p) => !localRegistryIds.has(p.id),
      ),
    [registryData, localRegistryIds],
  );

  const registrySection =
    hasSearch && registryResults.length > 0 ? (
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
          {registryResults.map((pb) => (
            <RegistryPlaybookCard key={pb.id} playbook={pb} />
          ))}
        </div>
      </section>
    ) : hasSearch && registryLoading ? (
      <section className="border border-zinc-800/60 border-dashed bg-zinc-900/20 p-4">
        <div className="flex items-center gap-2 text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" />
          <span className="text-xs">Searching registry...</span>
        </div>
      </section>
    ) : null;

  return (
    <EntityListPage
      title="Playbooks"
      description="Browse native Ansible playbooks stored in the active repo."
      createPath="/playbooks/create"
      createLabel="Create playbook"
      isLoading={loading}
      isEmpty={filtered.length === 0}
      emptyTitle={search ? "No playbooks match your search." : "No playbooks yet."}
      emptySecondaryAction={search ? undefined : { label: "Import from registry", path: "/registry" }}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Filter by name or description..."
      afterContent={registrySection}
      headerExtra={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </Button>
      }
    >
      <div className="space-y-2">
        {filtered.map((playbook) => (
          <button
            key={playbook.id}
            type="button"
            className="w-full border border-zinc-800 bg-zinc-950/40 p-3 text-left hover:border-zinc-700"
            onClick={() => navigate(`/playbooks/${playbook.id}`)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0 flex-1">
                <p className="text-sm text-zinc-100">{playbook.name}</p>
                {playbook.description ? (
                  <p className="text-xs text-zinc-400">{playbook.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <PinButton path={`/playbooks/${playbook.id}`} label={playbook.name} />
                <p className="text-[11px] text-zinc-500">{playbook.roles.length} roles</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </EntityListPage>
  );
}
