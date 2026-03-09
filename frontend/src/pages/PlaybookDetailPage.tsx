import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/format";
import { hostDisplayLabel } from "@/lib/hosts";
import { useGroups, useHosts, useRackEntries } from "@/hooks/queries";
import {
  createPlaybookRun,
  deletePlaybook,
  getPlaybook,
  listPlaybookRuns,
  resolveTargets,
  type RoleCatalogEntry,
  updatePlaybook,
  type PlaybookRun,
  type TargetSelection,
  type PlaybookUpsertRequest,
} from "@/lib/playbooks";
import {
  needsRuntimeVarsDialog,
  RuntimeVarsDialog,
} from "@/components/playbooks/runtime-vars-dialog";
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

const EMPTY_TARGETS: TargetSelection = {
  groups: [],
  labels: [],
  hosts: [],
  racks: [],
};

function HeaderEditableTitle({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);
  if (editing) {
    return (
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditing(false);
          if (e.key === "Escape") setEditing(false);
        }}
        className="text-zinc-100 font-semibold h-auto py-1 px-2 -mx-2"
      />
    );
  }
  return (
    <h1
      className="text-zinc-100 font-semibold cursor-text rounded px-2 -mx-2 py-0.5 hover:bg-zinc-800/50"
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
    >
      {value || placeholder}
    </h1>
  );
}

function HeaderEditableDescription({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);
  if (editing) {
    return (
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") setEditing(false);
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder={placeholder}
        className="text-xs text-zinc-500 min-h-16 mt-1 -mx-2 px-2"
      />
    );
  }
  return (
    <p
      className="text-xs text-zinc-500 cursor-text rounded px-2 -mx-2 py-0.5 hover:bg-zinc-800/50 min-h-[1.25rem]"
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
    >
      {value || placeholder}
    </p>
  );
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const prefilledHost = searchParams.get("host") ?? undefined;
  const tabParam = searchParams.get("tab") ?? (prefilledHost ? "run" : "roles");
  const validTab = ["roles", "history", "run"].includes(tabParam) ? tabParam : "roles";
  const [activeTab, setActiveTab] = useState(validTab);
  const [draft, setDraft] = useState<PlaybookUpsertRequest | null>(null);
  const [roles_catalog, setRolesCatalog] = useState<RoleCatalogEntry[]>([]);
  const [targets, setTargets] = useState<TargetSelection>(
    prefilledHost
      ? { groups: [], labels: [], hosts: [prefilledHost], racks: [] }
      : EMPTY_TARGETS,
  );
  const [resolvedHosts, setResolvedHosts] = useState<string[]>([]);
  const [runs, setRuns] = useState<PlaybookRun[]>([]);
  const [viewingRunId, setViewingRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runtimeDialogOpen, setRuntimeDialogOpen] = useState(false);
  const [runBecome, setRunBecome] = useState(false);
  const savedDraftRef = useRef<PlaybookUpsertRequest | null>(null);

  const { data: groups = [] } = useGroups();
  const { data: hosts = [] } = useHosts();
  const { data: rackEntries = [] } = useRackEntries();

  const hostIdToDisplayLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const host of hosts) {
      map.set(host.id, hostDisplayLabel(host));
    }
    return map;
  }, [hosts]);
  const load = useCallback(async () => {
    if (!playbookId) return;
    setLoading(true);
    try {
      const [playbookResult, runsResult] = await Promise.all([
        getPlaybook(playbookId),
        listPlaybookRuns(playbookId),
      ]);
      const loaded = {
        name: playbookResult.playbook.name,
        description: playbookResult.playbook.description,
        roles: playbookResult.playbook.role_entries,
      };
      setDraft(loaded);
      savedDraftRef.current = loaded;
      setRolesCatalog(playbookResult.playbook.roles_catalog);
      setRuns(runsResult.runs);
      const activeRun = runsResult.runs.find(
        (run) => run.status === "queued" || run.status === "running",
      );
      setViewingRunId(
        activeRun?.id ?? runsResult.runs[0]?.id ?? null,
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

  useEffect(() => {
    const tab = searchParams.get("tab") ?? (prefilledHost ? "run" : "roles");
    if (["roles", "history", "run"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams, prefilledHost]);

  const handleTabChange = useCallback(
    (value: string) => {
      setActiveTab(value);
      const next = new URLSearchParams(searchParams);
      next.set("tab", value);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (!draft || !playbookId || !savedDraftRef.current) return;
    if (
      draft.name === savedDraftRef.current.name &&
      draft.description === savedDraftRef.current.description &&
      JSON.stringify(draft.roles) === JSON.stringify(savedDraftRef.current.roles)
    ) {
      return;
    }
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        const result = await updatePlaybook(playbookId, draft);
        const next = {
          name: result.playbook.name,
          description: result.playbook.description,
          roles: result.playbook.role_entries,
        };
        setDraft(next);
        savedDraftRef.current = next;
        setRolesCatalog(result.playbook.roles_catalog);
        toast.success("Playbook saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save playbook");
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [draft, playbookId]);

  const tagOptions = useMemo(
    () =>
      Array.from(
        new Set(hosts.flatMap((n) => n.labels ?? [])),
      ).sort(),
    [hosts],
  );

  const groupFilterOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.id,
        label: g.name,
      })),
    [groups],
  );

  const rackFilterOptions = useMemo(
    () =>
      rackEntries.map(({ rack }) => ({
        value: rack.id,
        label: rack.name,
      })),
    [rackEntries],
  );

  const hostFilterOptions = useMemo(
    () =>
      hosts
        .filter((n) => n.managed && n.ip_address && n.ssh_user)
        .map((n) => ({
          value: n.id,
          label: n.name || n.hostname || n.ip_address || n.id,
          group: (n.groups ?? [])[0],
        })),
    [hosts],
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
    void resolveTargets(targets)
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
            <div className="min-w-0 flex-1 space-y-1">
              <HeaderEditableTitle
                value={draft.name || playbookId}
                placeholder="Playbook name"
                onChange={(name) => setDraft((d) => (d ? { ...d, name } : d))}
              />
              <HeaderEditableDescription
                value={draft.description}
                placeholder="Double-click to add a description"
                onChange={(description) =>
                  setDraft((d) => (d ? { ...d, description } : d))
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {saving ? (
                <span className="text-xs text-zinc-500">Saving...</span>
              ) : null}
              <Badge variant="outline">{draft.roles.length} roles</Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={async () => {
                  if (!window.confirm("Delete this playbook? Run history will be lost.")) return;
                  setSaving(true);
                  try {
                    await deletePlaybook(playbookId);
                    toast.success("Playbook deleted");
                    navigate("/playbooks", { replace: true });
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Failed to delete playbook");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Delete playbook
              </Button>
            </div>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList variant="line">
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="run">Run</TabsTrigger>
          </TabsList>

          <TabsContent value="roles">
            <PlaybookEditorForm
              draft={draft}
              roles={roles_catalog}
              compact
              onChange={setDraft}
            />
          </TabsContent>

          <TabsContent value="run">
            <div className="space-y-4">
              <section className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
                <div className="space-y-1">
                  <p className="text-zinc-100 font-medium">Run</p>
                  <p className="text-xs text-zinc-500">
                    Narrow targets with searchable filters, then run the playbook below.
                  </p>
                </div>

                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <Checkbox
                    checked={runBecome}
                    onCheckedChange={(checked) => setRunBecome(checked === true)}
                  />
                  Run with privilege escalation (will prompt for sudo password)
                </label>

                <div className="grid gap-3 xl:grid-cols-4">
                  <SearchableFilterDropdown
                    label="Racks"
                    placeholder="Search racks..."
                    options={rackFilterOptions}
                    values={targets.racks}
                    onToggle={(value) =>
                      setTargets((current) => ({
                        ...current,
                        racks: toggleValue(current.racks, value),
                      }))
                    }
                  />
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
                    label="Labels"
                    placeholder="Search labels..."
                    options={tagOptions.map((tag) => ({ value: tag, label: tag }))}
                    values={targets.labels}
                    onToggle={(value) =>
                      setTargets((current) => ({
                        ...current,
                        labels: toggleValue(current.labels, value),
                      }))
                    }
                  />
                  <SearchableFilterDropdown
                    label="Hosts"
                    placeholder="Search hosts..."
                    options={hostFilterOptions}
                    values={targets.hosts}
                    onToggle={(value) =>
                      setTargets((current) => ({
                        ...current,
                        hosts: toggleValue(current.hosts, value),
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
                    Active filters: {targets.racks.length} rack, {targets.groups.length} group, {targets.labels.length} label, {targets.hosts.length} host
                  </p>
                  {resolvedHosts.length === 0 ? (
                    <p className="text-xs text-zinc-500">No hosts matched the current selection.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {resolvedHosts.map((hostId) => (
                        <Badge key={hostId} variant="outline" title={hostId}>
                          {hostIdToDisplayLabel.get(hostId) ?? hostId}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <RuntimeVarsDialog
                    open={runtimeDialogOpen}
                    roles={roles_catalog}
                    needsBecomePassword={runBecome}
                    onConfirm={async (runtimeVars, becomePassword) => {
                      setRuntimeDialogOpen(false);
                      setRunning(true);
                      try {
                        const result = await createPlaybookRun(playbookId, {
                          targets,
                          runtime_vars: Object.keys(runtimeVars).length > 0 ? runtimeVars : undefined,
                          become: runBecome,
                          become_password: runBecome ? becomePassword ?? undefined : undefined,
                        });
                        setRuns((prev) => [result.run, ...prev]);
                        setViewingRunId(result.run.id);
                        toast.success("Playbook started");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to run playbook");
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
                      if (needsRuntimeVarsDialog(roles_catalog, runBecome)) {
                        setRuntimeDialogOpen(true);
                        return;
                      }
                      setRunning(true);
                      try {
                        const result = await createPlaybookRun(playbookId, {
                          targets,
                          become: runBecome,
                        });
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
                  <PlaybookRunOutput
                    run={runs.find((r) => r.id === viewingRunId) ?? null}
                    onRunUpdate={handleRunUpdate}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
