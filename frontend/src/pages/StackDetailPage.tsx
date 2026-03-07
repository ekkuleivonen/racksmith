import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, LoaderCircle, Play, Search } from "lucide-react";
import { toast } from "sonner";
import { StackEditorForm } from "@/components/stacks/stack-editor-form";
import { StackRunOutput } from "@/components/stacks/stack-run-output";
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
import { useStackStore } from "@/stores/stacks";
import { useRackStore } from "@/stores/racks";
import { useGroupsStore } from "@/stores/groups";
import { useNodesStore } from "@/stores/nodes";
import {
  createStackRun,
  deleteStack,
  getStack,
  listStackRuns,
  resolveStackTargets,
  type Action,
  updateStack,
  type StackRun,
  type StackTargetSelection,
  type StackUpsertRequest,
} from "@/lib/stacks";
import {
  needsRuntimeVarsDialog,
  RuntimeVarsDialog,
} from "@/components/stacks/runtime-vars-dialog";
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

const EMPTY_TARGETS: StackTargetSelection = {
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

export function StackDetailPage() {
  const { stackId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledNode = searchParams.get("node") ?? undefined;
  const [draft, setDraft] = useState<StackUpsertRequest | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [targets, setTargets] = useState<StackTargetSelection>(
    prefilledNode ? { groups: [], tags: [], nodes: [prefilledNode] } : EMPTY_TARGETS,
  );
  const [resolvedHosts, setResolvedHosts] = useState<string[]>([]);
  const [runs, setRuns] = useState<StackRun[]>([]);
  const [viewingRunId, setViewingRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runtimeDialogOpen, setRuntimeDialogOpen] = useState(false);

  const groups = useGroupsStore((s) => s.groups);
  const nodes = useNodesStore((s) => s.nodes);
  const loadGroups = useGroupsStore((s) => s.load);
  const loadNodes = useNodesStore((s) => s.load);

  const load = useCallback(async () => {
    if (!stackId) return;
    setLoading(true);
    try {
      const [stackResult, runsResult] = await Promise.all([
        getStack(stackId),
        listStackRuns(stackId),
      ]);
      setDraft({
        name: stackResult.stack.name,
        description: stackResult.stack.description,
        become: stackResult.stack.become,
        roles: stackResult.stack.role_entries,
      });
      setActions(stackResult.stack.actions);
      setRuns(runsResult.runs);
      const activeRun = runsResult.runs.find(
        (run) => run.status === "queued" || run.status === "running",
      );
      setViewingRunId(
        activeRun?.id ?? runsResult.runs[0]?.id ?? null,
      );
      await Promise.all([loadGroups(), loadNodes()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load stack");
    } finally {
      setLoading(false);
    }
  }, [stackId, loadGroups, loadNodes]);

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

  const handleRunUpdate = useCallback((run: StackRun) => {
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
    void resolveStackTargets(targets)
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
        <p className="text-zinc-500 text-sm">Loading stack...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-zinc-100 font-semibold">{draft.name || stackId}</h1>
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
                    Narrow targets with searchable filters, then run the stack below.
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
                  <RuntimeVarsDialog
                    open={runtimeDialogOpen}
                    actions={actions}
                    needsBecomePassword={draft.become}
                    onConfirm={async (runtimeVars, becomePassword) => {
                      setRuntimeDialogOpen(false);
                      setRunning(true);
                      try {
                        const result = await createStackRun(stackId, {
                          targets,
                          runtime_vars: Object.keys(runtimeVars).length > 0 ? runtimeVars : undefined,
                          become_password: becomePassword ?? undefined,
                        });
                        setRuns((prev) => [result.run, ...prev]);
                        setViewingRunId(result.run.id);
                        toast.success("Stack started");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to run stack");
                      } finally {
                        setRunning(false);
                      }
                    }}
                    onCancel={() => setRuntimeDialogOpen(false)}
                  />
                  <Button
                    size="sm"
                    disabled={running || resolving || resolvedHosts.length === 0}
                    onClick={async () => {
                      if (needsRuntimeVarsDialog(actions, draft.become)) {
                        setRuntimeDialogOpen(true);
                        return;
                      }
                      setRunning(true);
                      try {
                        const result = await createStackRun(stackId, { targets });
                        setRuns((prev) => [result.run, ...prev]);
                        setViewingRunId(result.run.id);
                        toast.success("Stack started");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to run stack");
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

              <StackRunOutput
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
                <p className="text-zinc-500 text-sm">No runs yet. Run a stack from the Run tab.</p>
              </section>
            ) : (
              <ResizablePanelGroup
                orientation="horizontal"
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
                  <StackRunOutput
                    run={runs.find((r) => r.id === viewingRunId) ?? null}
                    onRunUpdate={handleRunUpdate}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </TabsContent>

          <TabsContent value="editor">
            <StackEditorForm
              draft={draft}
              actions={actions}
              submitLabel={saving ? "Saving..." : "Save stack"}
              submitting={saving}
              inlineTextFields
              compact
              onChange={setDraft}
              onSubmit={async () => {
                setSaving(true);
                try {
                  const result = await updateStack(stackId, draft);
                  setDraft({
                    name: result.stack.name,
                    description: result.stack.description,
                    become: result.stack.become,
                    roles: result.stack.role_entries,
                  });
                  setActions(result.stack.actions);
                  await Promise.all([
                    useStackStore.getState().load(),
                    useRackStore.getState().load(),
                  ]);
                  if (result.stack.id !== stackId) {
                    navigate(`/stacks/${result.stack.id}`, { replace: true });
                  }
                  toast.success("Stack saved");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to save stack");
                } finally {
                  setSaving(false);
                }
              }}
              onDelete={async () => {
                if (!window.confirm("Delete this stack?")) return;
                setSaving(true);
                try {
                  await deleteStack(stackId);
                  await Promise.all([
                    useStackStore.getState().load(),
                    useRackStore.getState().load(),
                  ]);
                  toast.success("Stack deleted");
                  navigate("/stacks", { replace: true });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to delete stack");
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
