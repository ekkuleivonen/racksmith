import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown, LoaderCircle, Play, Search } from "lucide-react";
import { toast } from "sonner";
import { PlaybookEditorForm } from "@/components/playbooks/playbook-editor-form";
import { PlaybookRunOutput } from "@/components/playbooks/playbook-run-output";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { getRack, listRacks, type RackDetail, type RackItem } from "@/lib/racks";
import {
  createPlaybookRun,
  deletePlaybook,
  getPlaybook,
  listPlaybookRuns,
  resolvePlaybookTargets,
  type RoleTemplate,
  updatePlaybook,
  type PlaybookRun,
  type PlaybookTargetSelection,
  type PlaybookUpsertRequest,
} from "@/lib/playbooks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RackItemGroup = {
  rack: RackDetail;
  items: RackItem[];
};

type SearchableFilterDropdownProps = {
  label: string;
  placeholder: string;
  options: Array<{ value: string; label: string; group?: string }>;
  values: string[];
  onToggle: (value: string) => void;
};

const EMPTY_TARGETS: PlaybookTargetSelection = {
  rack_ids: [],
  labels: [],
  items: [],
};

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

function toggleItem(
  values: PlaybookTargetSelection["items"],
  rackId: string,
  itemId: string,
): PlaybookTargetSelection["items"] {
  return values.some((item) => item.rack_id === rackId && item.item_id === itemId)
    ? values.filter((item) => !(item.rack_id === rackId && item.item_id === itemId))
    : [...values, { rack_id: rackId, item_id: itemId }];
}

function SearchableFilterDropdown({
  label,
  placeholder,
  options,
  values,
  onToggle,
}: SearchableFilterDropdownProps) {
  const [query, setQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.group ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [options, query]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between text-xs font-normal">
          <span className="truncate">
            {label}: {values.length === 0 ? "All" : `${values.length} selected`}
          </span>
          <ChevronDown className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[22rem] p-1">
        <div className="p-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder={placeholder}
              className="pl-7 text-xs"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-auto">
          {filteredOptions.length === 0 ? (
            <p className="px-2 py-2 text-xs text-zinc-500">No matches.</p>
          ) : (
            filteredOptions.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={values.includes(option.value)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => onToggle(option.value)}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{option.label}</span>
                  {option.group ? (
                    <span className="truncate text-[10px] text-zinc-500">{option.group}</span>
                  ) : null}
                </div>
              </DropdownMenuCheckboxItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PlaybookDetailPage() {
  const { playbookId = "" } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<PlaybookUpsertRequest | null>(null);
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  const [rackGroups, setRackGroups] = useState<RackItemGroup[]>([]);
  const [targets, setTargets] = useState<PlaybookTargetSelection>(EMPTY_TARGETS);
  const [resolvedHosts, setResolvedHosts] = useState<string[]>([]);
  const [currentRun, setCurrentRun] = useState<PlaybookRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    if (!playbookId) return;
    setLoading(true);
    try {
      const [playbookResult, rackSummaries, runsResult] = await Promise.all([
        getPlaybook(playbookId),
        listRacks(),
        listPlaybookRuns(playbookId),
      ]);
      setDraft({
        play_name: playbookResult.playbook.play_name,
        description: playbookResult.playbook.description,
        become: playbookResult.playbook.become,
        roles: playbookResult.playbook.role_entries,
      });
      setRoleTemplates(playbookResult.playbook.role_templates);

      const groups = await Promise.all(
        rackSummaries.map(async (summary) => {
          const rack = await getRack(summary.id);
          return {
            rack: rack.rack,
            items: rack.items.filter((item) => item.managed && item.host && item.ssh_user),
          };
        }),
      );
      setRackGroups(groups);
      setCurrentRun(
        runsResult.runs.find(
          (run) => run.status === "queued" || run.status === "running",
        ) ?? null,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load playbook");
    } finally {
      setLoading(false);
    }
  }, [playbookId]);

  useEffect(() => {
    void load();
  }, [load]);

  const labelOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rackGroups.flatMap((group) =>
            group.items.flatMap((item) => item.tags),
          ),
        ),
      ).sort(),
    [rackGroups],
  );

  const rackFilterOptions = useMemo(
    () =>
      rackGroups.map((group) => ({
        value: group.rack.id,
        label: group.rack.name,
      })),
    [rackGroups],
  );

  const itemFilterOptions = useMemo(
    () =>
      rackGroups.flatMap((group) =>
        group.items.map((item) => ({
          value: `${group.rack.id}:${item.id}`,
          label: item.name || item.host || item.id,
          group: group.rack.name,
        })),
      ),
    [rackGroups],
  );

  const handleRunUpdate = useCallback((run: PlaybookRun) => {
    setCurrentRun(run);
    if (run.status === "completed" || run.status === "failed") {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setResolving(true);
    void resolvePlaybookTargets(targets)
      .then((result) => {
        if (!active) return;
        setResolvedHosts(result.hosts);
      })
      .catch(() => {
        if (!active) return;
        setResolvedHosts([]);
      })
      .finally(() => {
        if (active) setResolving(false);
      });
    return () => {
      active = false;
    };
  }, [targets]);

  if (loading || !draft) {
    return (
      <div className="h-full overflow-auto p-6">
        <p className="text-zinc-500 text-sm">Loading playbook...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-zinc-100 font-semibold">{draft.play_name || playbookId}</h1>
              {draft.description ? (
                <p className="text-xs text-zinc-500">{draft.description}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">{draft.roles.length} roles</Badge>
              <Badge variant="outline">{draft.become ? "become" : "no become"}</Badge>
            </div>
          </div>
        </section>

        <Tabs defaultValue="run">
          <TabsList variant="line">
            <TabsTrigger value="run">Run</TabsTrigger>
            <TabsTrigger value="editor">Editor</TabsTrigger>
          </TabsList>

          <TabsContent value="run">
            <div className="space-y-4">
              <section className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
                <div className="space-y-1">
                  <p className="text-zinc-100 font-medium">Run</p>
                  <p className="text-xs text-zinc-500">
                    Narrow targets with searchable filters, then run the playbook below.
                  </p>
                </div>

                <div className="grid gap-3 xl:grid-cols-3">
                  <SearchableFilterDropdown
                    label="Racks"
                    placeholder="Search racks..."
                    options={rackFilterOptions}
                    values={targets.rack_ids}
                    onToggle={(value) =>
                      setTargets((current) => ({
                        ...current,
                        rack_ids: toggleValue(current.rack_ids, value),
                      }))
                    }
                  />
                  <SearchableFilterDropdown
                    label="Labels"
                    placeholder="Search labels..."
                    options={labelOptions.map((label) => ({ value: label, label }))}
                    values={targets.labels}
                    onToggle={(value) =>
                      setTargets((current) => ({
                        ...current,
                        labels: toggleValue(current.labels, value),
                      }))
                    }
                  />
                  <SearchableFilterDropdown
                    label="Items"
                    placeholder="Search items..."
                    options={itemFilterOptions}
                    values={targets.items.map((item) => `${item.rack_id}:${item.item_id}`)}
                    onToggle={(value) => {
                      const [rackId, itemId] = value.split(":", 2);
                      if (!rackId || !itemId) return;
                      setTargets((current) => ({
                        ...current,
                        items: toggleItem(current.items, rackId, itemId),
                      }));
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-zinc-100 font-medium">Resolved hosts</p>
                    {resolving ? <LoaderCircle className="size-4 animate-spin text-zinc-400" /> : null}
                  </div>
                  <p className="text-xs text-zinc-500">
                    Active filters: {targets.rack_ids.length} rack, {targets.labels.length} label, {targets.items.length} item
                  </p>
                  {resolvedHosts.length === 0 ? (
                    <p className="text-xs text-zinc-500">No hosts matched the current selection.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {resolvedHosts.map((host) => (
                        <Badge key={host} variant="outline">
                          {host}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={running || resolving || resolvedHosts.length === 0}
                    onClick={async () => {
                      setRunning(true);
                      try {
                        const result = await createPlaybookRun(playbookId, targets);
                        setCurrentRun(result.run);
                        toast.success("Playbook started");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to run playbook");
                      } finally {
                        setRunning(false);
                      }
                    }}
                  >
                    <Play className="size-3.5" />
                    Play
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTargets(EMPTY_TARGETS)}
                    disabled={resolving}
                  >
                    Clear filters
                  </Button>
                </div>
              </section>

              <PlaybookRunOutput run={currentRun} onRunUpdate={handleRunUpdate} />
            </div>
          </TabsContent>

          <TabsContent value="editor">
            <PlaybookEditorForm
              draft={draft}
              roleTemplates={roleTemplates}
              submitLabel={saving ? "Saving..." : "Save playbook"}
              submitting={saving}
              inlineTextFields
              compact
              onChange={setDraft}
              onSubmit={async () => {
                setSaving(true);
                try {
                  const result = await updatePlaybook(playbookId, draft);
                  setDraft({
                    play_name: result.playbook.play_name,
                    description: result.playbook.description,
                    become: result.playbook.become,
                    roles: result.playbook.role_entries,
                  });
                  setRoleTemplates(result.playbook.role_templates);
                  window.dispatchEvent(new Event("racksmith:sidebar-refresh"));
                  if (result.playbook.id !== playbookId) {
                    navigate(`/playbooks/${result.playbook.id}`, { replace: true });
                  }
                  toast.success("Playbook saved");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to save playbook");
                } finally {
                  setSaving(false);
                }
              }}
              onDelete={async () => {
                if (!window.confirm("Delete this playbook?")) return;
                setSaving(true);
                try {
                  await deletePlaybook(playbookId);
                  window.dispatchEvent(new Event("racksmith:sidebar-refresh"));
                  toast.success("Playbook deleted");
                  navigate("/playbooks", { replace: true });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to delete playbook");
                } finally {
                  setSaving(false);
                }
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
