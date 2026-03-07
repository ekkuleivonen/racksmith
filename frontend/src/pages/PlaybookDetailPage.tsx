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
import { formatRelativeTime } from "@/lib/format";
import { usePlaybookStore } from "@/stores/playbooks";
import { useRackStore } from "@/stores/racks";
import { useGroupsStore } from "@/stores/groups";
import { useNodesStore } from "@/stores/nodes";
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
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SearchableFilterDropdownProps = {
  label: string;
  placeholder: string;
  options: Array<{ value: string; label: string; group?: string }>;
  values: string[];
  onToggle: (value: string) => void;
};

const EMPTY_TARGETS: PlaybookTargetSelection = {
  groups: [],
  tags: [],
  nodes: [],
};

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
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
  const [targets, setTargets] = useState<PlaybookTargetSelection>(EMPTY_TARGETS);
  const [resolvedHosts, setResolvedHosts] = useState<string[]>([]);
  const [runs, setRuns] = useState<PlaybookRun[]>([]);
  const [viewingRunId, setViewingRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [running, setRunning] = useState(false);

  const groups = useGroupsStore((s) => s.groups);
  const nodes = useNodesStore((s) => s.nodes);
  const loadGroups = useGroupsStore((s) => s.load);
  const loadNodes = useNodesStore((s) => s.load);

  const load = useCallback(async () => {
    if (!playbookId) return;
    setLoading(true);
    try {
      const [playbookResult, runsResult] = await Promise.all([
        getPlaybook(playbookId),
        listPlaybookRuns(playbookId),
      ]);
      setDraft({
        play_name: playbookResult.playbook.play_name,
        description: playbookResult.playbook.description,
        become: playbookResult.playbook.become,
        roles: playbookResult.playbook.role_entries,
      });
      setRoleTemplates(playbookResult.playbook.role_templates);
      setRuns(runsResult.runs);
      const activeRun = runsResult.runs.find(
        (run) => run.status === "queued" || run.status === "running",
      );
      setViewingRunId(
        activeRun?.id ?? runsResult.runs[0]?.id ?? null,
      );
      await Promise.all([loadGroups(), loadNodes()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load playbook");
    } finally {
      setLoading(false);
    }
  }, [playbookId, loadGroups, loadNodes]);

  useEffect(() => {
    void load();
  }, [load]);

  const tagOptions = useMemo(
    () =>
      Array.from(
        new Set(nodes.flatMap((n) => n.tags ?? [])),
      ).sort(),
    [nodes],
  );

  const groupFilterOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.slug,
        label: g.name,
      })),
    [groups],
  );

  const nodeFilterOptions = useMemo(
    () =>
      nodes
        .filter((n) => n.managed && n.host && n.ssh_user)
        .map((n) => ({
          value: n.slug,
          label: n.name || n.host || n.slug,
          group: (n.groups ?? [])[0],
        })),
    [nodes],
  );

  const handleRunUpdate = useCallback((run: PlaybookRun) => {
    setRuns((prev) => {
      const idx = prev.findIndex((r) => r.id === run.id);
      if (idx < 0) return [run, ...prev];
      const next = [...prev];
      next[idx] = run;
      return next;
    });
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
            <TabsTrigger value="history">History</TabsTrigger>
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
                    label="Groups"
                    placeholder="Search groups..."
                    options={groupFilterOptions}
                    values={targets.groups}
                    onToggle={(value) =>
                      setTargets((current) => ({
                        ...current,
                        groups: toggleValue(current.groups, value),
                      }))
                    }
                  />
                  <SearchableFilterDropdown
                    label="Tags"
                    placeholder="Search tags..."
                    options={tagOptions.map((tag) => ({ value: tag, label: tag }))}
                    values={targets.tags}
                    onToggle={(value) =>
                      setTargets((current) => ({
                        ...current,
                        tags: toggleValue(current.tags, value),
                      }))
                    }
                  />
                  <SearchableFilterDropdown
                    label="Nodes"
                    placeholder="Search nodes..."
                    options={nodeFilterOptions}
                    values={targets.nodes}
                    onToggle={(value) =>
                      setTargets((current) => ({
                        ...current,
                        nodes: toggleValue(current.nodes, value),
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-zinc-100 font-medium">Resolved hosts</p>
                    {resolving ? <LoaderCircle className="size-4 animate-spin text-zinc-400" /> : null}
                  </div>
                  <p className="text-xs text-zinc-500">
                    Active filters: {targets.groups.length} group, {targets.tags.length} tag, {targets.nodes.length} node
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
                        setRuns((prev) => [result.run, ...prev]);
                        setViewingRunId(result.run.id);
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

              <PlaybookRunOutput
                run={
                  runs.find((r) => r.status === "queued" || r.status === "running") ??
                  runs.find((r) => r.id === viewingRunId) ??
                  null
                }
                onRunUpdate={handleRunUpdate}
              />
            </div>
          </TabsContent>

          <TabsContent value="history">
            {runs.length === 0 ? (
              <section className="border border-zinc-800 bg-zinc-900/30 p-4">
                <p className="text-zinc-500 text-sm">No runs yet. Run a playbook from the Run tab.</p>
              </section>
            ) : (
              <ResizablePanelGroup
                direction="horizontal"
                className="min-h-0 flex-1"
              >
                <ResizablePanel defaultSize={20} minSize={12} className="min-w-0">
                  <section className="h-full border border-zinc-800 bg-zinc-900/30 p-3 flex flex-col min-h-0">
                    <p className="mb-2 text-xs font-medium text-zinc-400 shrink-0">Run history</p>
                    <ScrollArea className="flex-1 min-h-0">
                      <div className="space-y-0.5 pr-2">
                        {runs.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setViewingRunId(r.id)}
                            className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-zinc-800/80 ${
                              viewingRunId === r.id
                                ? "bg-zinc-800 text-zinc-100"
                                : "text-zinc-400"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={
                                  r.status === "completed"
                                    ? "default"
                                    : r.status === "failed"
                                      ? "destructive"
                                      : "outline"
                                }
                                className="text-[10px] px-1"
                              >
                                {r.status}
                              </Badge>
                              <span className="truncate text-[10px]">
                                {formatRelativeTime(r.created_at)}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                              {r.hosts.length} host{r.hosts.length === 1 ? "" : "s"}
                              {r.exit_code != null ? ` · exit ${r.exit_code}` : ""}
                              {r.commit_sha ? (
                                <span title={r.commit_sha}> · {r.commit_sha.slice(0, 7)}</span>
                              ) : null}
                            </p>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </section>
                </ResizablePanel>
                <ResizableHandle withHandle className="bg-zinc-800" />
                <ResizablePanel defaultSize={80} minSize={40} className="min-w-0">
                  <PlaybookRunOutput
                    run={runs.find((r) => r.id === viewingRunId) ?? null}
                    onRunUpdate={handleRunUpdate}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
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
                  await Promise.all([
                    usePlaybookStore.getState().load(),
                    useRackStore.getState().load(),
                  ]);
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
                  await Promise.all([
                    usePlaybookStore.getState().load(),
                    useRackStore.getState().load(),
                  ]);
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
