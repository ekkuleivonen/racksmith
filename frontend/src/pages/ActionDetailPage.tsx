import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, LoaderCircle, Play, Search } from "lucide-react";
import { toast } from "sonner";
import { RunOutput } from "@/components/shared/run-output";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelativeTime } from "@/lib/format";
import { useGroupsStore } from "@/stores/groups";
import { useNodesStore } from "@/stores/nodes";
import { useActionsStore } from "@/stores/actions";
import { useCodeStore } from "@/stores/code";
import { resolveStackTargets, type StackTargetSelection } from "@/lib/stacks";
import jsYaml from "js-yaml";
import {
  getActionDetail,
  updateAction,
  deleteAction,
  createActionRun,
  listActionRuns,
  getActionRun,
  actionRunStreamUrl,
  type ActionDetail,
  type ActionRun,
  type ActionInput as ActionInputType,
} from "@/lib/actions";

// ── Shared filter dropdown (same as StackDetailPage) ────────────────

type SearchableFilterDropdownProps = {
  label: string;
  placeholder: string;
  options: Array<{ value: string; label: string; group?: string }>;
  values: string[];
  onToggle: (value: string) => void;
};

const EMPTY_TARGETS: StackTargetSelection = {
  groups: [],
  labels: [],
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
        <Button
          variant="outline"
          className="w-full justify-between text-xs font-normal"
        >
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
                    <span className="truncate text-[10px] text-zinc-500">
                      {option.group}
                    </span>
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

// ── Action input form row ───────────────────────────────────────────

function ActionInputField({
  input,
  value,
  onChange,
}: {
  input: ActionInputType;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  if (input.interactive) return null;

  const inputType = input.type ?? "string";

  if (inputType === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={input.key}
          checked={value === true || value === "true"}
          onCheckedChange={(checked) => onChange(input.key, checked === true)}
        />
        <Label htmlFor={input.key} className="text-xs text-zinc-300">
          {input.label}
        </Label>
      </div>
    );
  }

  if (inputType === "select" && input.options?.length) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-zinc-400">{input.label}</Label>
        <Select
          value={String(value ?? input.default ?? "")}
          onValueChange={(v) => onChange(input.key, v)}
        >
          <SelectTrigger className="text-xs">
            <SelectValue placeholder={input.placeholder || "Select..."} />
          </SelectTrigger>
          <SelectContent>
            {input.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (inputType === "secret") {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-zinc-400">{input.label}</Label>
        <Input
          type="password"
          value={String(value ?? "")}
          onChange={(e) => onChange(input.key, e.target.value)}
          placeholder={input.placeholder}
          className="text-xs"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-zinc-400">{input.label}</Label>
      <Input
        value={String(value ?? "")}
        onChange={(e) => onChange(input.key, e.target.value)}
        placeholder={input.placeholder}
        className="text-xs"
      />
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────

export function ActionDetailPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledNode = searchParams.get("node") ?? undefined;

  const [action, setAction] = useState<ActionDetail | null>(null);
  const [targets, setTargets] = useState<StackTargetSelection>(
    prefilledNode
      ? { groups: [], labels: [], nodes: [prefilledNode] }
      : EMPTY_TARGETS,
  );
  const [resolvedHosts, setResolvedHosts] = useState<string[]>([]);
  const [inputVars, setInputVars] = useState<Record<string, unknown>>({});
  const [become, setBecome] = useState(false);
  const [becomePassword, setBecomePassword] = useState("");
  const [runs, setRuns] = useState<ActionRun[]>([]);
  const [viewingRunId, setViewingRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [running, setRunning] = useState(false);
  const [editorMode, setEditorMode] = useState<"form" | "yaml">("yaml");
  const [yamlDraft, setYamlDraft] = useState("");

  const groups = useGroupsStore((s) => s.groups);
  const nodes = useNodesStore((s) => s.nodes);
  const loadGroups = useGroupsStore((s) => s.load);
  const loadNodes = useNodesStore((s) => s.load);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const [detailResult, runsResult] = await Promise.all([
        getActionDetail(slug),
        listActionRuns(slug),
      ]);
      setAction(detailResult.action);
      setYamlDraft(detailResult.action.raw_content);
      setRuns(runsResult.runs);

      // Prefill input defaults
      const defaults: Record<string, unknown> = {};
      for (const inp of detailResult.action.inputs) {
        if (inp.default != null && !inp.interactive) {
          defaults[inp.key] = inp.default;
        }
      }
      setInputVars(defaults);

      const activeRun = runsResult.runs.find(
        (run) => run.status === "queued" || run.status === "running",
      );
      setViewingRunId(activeRun?.id ?? runsResult.runs[0]?.id ?? null);
      await Promise.all([loadGroups(), loadNodes()]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load action",
      );
    } finally {
      setLoading(false);
    }
  }, [slug, loadGroups, loadNodes]);

  useEffect(() => {
    void load();
  }, [load]);

  const tagOptions = useMemo(
    () => Array.from(new Set(nodes.flatMap((n) => n.labels ?? []))).sort(),
    [nodes],
  );

  const groupFilterOptions = useMemo(
    () => groups.map((g) => ({ value: g.slug, label: g.name })),
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

  const handleRunUpdate = useCallback((run: ActionRun) => {
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

  const nonInteractiveInputs = useMemo(
    () => (action?.inputs ?? []).filter((i) => !i.interactive),
    [action],
  );

  const interactiveInputs = useMemo(
    () => (action?.inputs ?? []).filter((i) => i.interactive),
    [action],
  );

  if (loading || !action) {
    return (
      <div className="h-full overflow-auto p-6">
        <p className="text-zinc-500 text-sm">Loading action...</p>
      </div>
    );
  }

  const handleRun = async () => {
    setRunning(true);
    try {
      const runtimeVars: Record<string, string> = {};
      for (const inp of interactiveInputs) {
        const val = inputVars[inp.key];
        if (val != null && val !== "") {
          runtimeVars[inp.key] = String(val);
        }
      }

      const actionVars: Record<string, unknown> = {};
      for (const inp of nonInteractiveInputs) {
        const val = inputVars[inp.key];
        if (val != null && val !== "") {
          actionVars[inp.key] = val;
        }
      }

      const result = await createActionRun(slug, {
        targets,
        vars: actionVars,
        become,
        become_password: become && becomePassword ? becomePassword : undefined,
        runtime_vars:
          Object.keys(runtimeVars).length > 0 ? runtimeVars : undefined,
      });
      setRuns((prev) => [result.run, ...prev]);
      setViewingRunId(result.run.id);
      toast.success("Action started");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to run action",
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Header */}
        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-zinc-100 font-semibold">{action.name}</h1>
              {action.description ? (
                <p className="text-xs text-zinc-500">{action.description}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">{action.source}</Badge>
              <Badge variant="outline">{action.inputs.length} inputs</Badge>
              {action.has_tasks ? (
                <Badge variant="outline">has tasks</Badge>
              ) : null}
            </div>
          </div>
        </section>

        <Tabs defaultValue="run">
          <TabsList variant="line">
            <TabsTrigger value="run">Run</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="editor">Editor</TabsTrigger>
          </TabsList>

          {/* ── Run tab ──────────────────────────────────────────── */}
          <TabsContent value="run">
            <div className="space-y-4">
              <section className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
                <div className="space-y-1">
                  <p className="text-zinc-100 font-medium">Run</p>
                  <p className="text-xs text-zinc-500">
                    Select target nodes, fill in variables, then run the action.
                  </p>
                </div>

                {/* Target filters */}
                <div className="grid gap-3 xl:grid-cols-3">
                  <SearchableFilterDropdown
                    label="Groups"
                    placeholder="Search groups..."
                    options={groupFilterOptions}
                    values={targets.groups}
                    onToggle={(value) =>
                      setTargets((cur) => ({
                        ...cur,
                        groups: toggleValue(cur.groups, value),
                      }))
                    }
                  />
                  <SearchableFilterDropdown
                    label="Labels"
                    placeholder="Search labels..."
                    options={tagOptions.map((tag) => ({
                      value: tag,
                      label: tag,
                    }))}
                    values={targets.labels}
                    onToggle={(value) =>
                      setTargets((cur) => ({
                        ...cur,
                        labels: toggleValue(cur.labels, value),
                      }))
                    }
                  />
                  <SearchableFilterDropdown
                    label="Nodes"
                    placeholder="Search nodes..."
                    options={nodeFilterOptions}
                    values={targets.nodes}
                    onToggle={(value) =>
                      setTargets((cur) => ({
                        ...cur,
                        nodes: toggleValue(cur.nodes, value),
                      }))
                    }
                  />
                </div>

                {/* Resolved hosts */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-zinc-100 font-medium">Resolved hosts</p>
                    {resolving ? (
                      <LoaderCircle className="size-4 animate-spin text-zinc-400" />
                    ) : null}
                  </div>
                  <p className="text-xs text-zinc-500">
                    Active filters: {targets.groups.length} group,{" "}
                    {targets.labels.length} label, {targets.nodes.length} node
                  </p>
                  {resolvedHosts.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      No hosts matched the current selection.
                    </p>
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

                {/* Action inputs */}
                {nonInteractiveInputs.length > 0 ||
                interactiveInputs.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-zinc-100 font-medium">Variables</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[...nonInteractiveInputs, ...interactiveInputs].map(
                        (inp) => (
                          <ActionInputField
                            key={inp.key}
                            input={inp}
                            value={inputVars[inp.key] ?? inp.default ?? ""}
                            onChange={(key, val) =>
                              setInputVars((cur) => ({ ...cur, [key]: val }))
                            }
                          />
                        ),
                      )}
                    </div>
                  </div>
                ) : null}

                {/* Become */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="become"
                      checked={become}
                      onCheckedChange={setBecome}
                    />
                    <Label htmlFor="become" className="text-xs text-zinc-300">
                      Become (sudo)
                    </Label>
                  </div>
                  {become ? (
                    <Input
                      type="password"
                      placeholder="Become password"
                      value={becomePassword}
                      onChange={(e) => setBecomePassword(e.target.value)}
                      className="max-w-xs text-xs"
                    />
                  ) : null}
                </div>

                {/* Controls */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={
                      running || resolving || resolvedHosts.length === 0
                    }
                    onClick={handleRun}
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

              <RunOutput<ActionRun>
                run={
                  runs.find(
                    (r) => r.status === "queued" || r.status === "running",
                  ) ??
                  runs.find((r) => r.id === viewingRunId) ??
                  null
                }
                title={(r) => r.action_name}
                emptyMessage="Run an action to stream its output here."
                onRunUpdate={handleRunUpdate}
                streamUrl={actionRunStreamUrl}
                fetchRun={getActionRun}
              />
            </div>
          </TabsContent>

          {/* ── History tab ───────────────────────────────────────── */}
          <TabsContent value="history">
            {runs.length === 0 ? (
              <section className="border border-zinc-800 bg-zinc-900/30 p-4">
                <p className="text-zinc-500 text-sm">
                  No runs yet. Run the action from the Run tab.
                </p>
              </section>
            ) : (
              <ResizablePanelGroup
                orientation="horizontal"
                className="min-h-0 flex-1"
              >
                <ResizablePanel
                  defaultSize={20}
                  minSize={12}
                  className="min-w-0"
                >
                  <section className="h-full border border-zinc-800 bg-zinc-900/30 p-3 flex flex-col min-h-0">
                    <p className="mb-2 text-xs font-medium text-zinc-400 shrink-0">
                      Run history
                    </p>
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
                              {r.hosts.length} host
                              {r.hosts.length === 1 ? "" : "s"}
                              {r.exit_code != null
                                ? ` · exit ${r.exit_code}`
                                : ""}
                              {r.commit_sha ? (
                                <span title={r.commit_sha}>
                                  {" "}
                                  · {r.commit_sha.slice(0, 7)}
                                </span>
                              ) : null}
                            </p>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </section>
                </ResizablePanel>
                <ResizableHandle withHandle className="bg-zinc-800" />
                <ResizablePanel
                  defaultSize={80}
                  minSize={40}
                  className="min-w-0"
                >
                  <RunOutput<ActionRun>
                    run={runs.find((r) => r.id === viewingRunId) ?? null}
                    title={(r) => r.action_name}
                    emptyMessage="Select a run from the list."
                    onRunUpdate={handleRunUpdate}
                    streamUrl={actionRunStreamUrl}
                    fetchRun={getActionRun}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </TabsContent>

          {/* ── Editor tab ────────────────────────────────────────── */}
          <TabsContent value="editor">
            <section className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-zinc-100 font-medium">Edit action</p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={editorMode === "yaml" ? "default" : "outline"}
                    onClick={() => setEditorMode("yaml")}
                    className="h-7 text-[11px]"
                  >
                    YAML
                  </Button>
                  <Button
                    size="sm"
                    variant={editorMode === "form" ? "default" : "outline"}
                    onClick={() => setEditorMode("form")}
                    className="h-7 text-[11px]"
                  >
                    Form
                  </Button>
                </div>
              </div>

              {editorMode === "yaml" ? (
                <div className="space-y-3">
                  <Textarea
                    value={yamlDraft}
                    onChange={(e) => setYamlDraft(e.target.value)}
                    className="font-mono text-xs min-h-[520px] bg-zinc-900 border-zinc-700 text-zinc-200 resize-y"
                    spellCheck={false}
                  />
                </div>
              ) : (
                <ActionFormEditor action={action} onYamlChange={setYamlDraft} />
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={saving || action.source === "builtin"}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const result = await updateAction(slug, yamlDraft);
                      setAction(result.action);
                      setYamlDraft(result.action.raw_content);
                      await useActionsStore.getState().load();
                      await useCodeStore.getState().refreshStatuses();
                      toast.success("Action saved");
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Failed to save action",
                      );
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "Saving..." : "Save action"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={saving || action.source === "builtin"}
                  onClick={async () => {
                    if (!window.confirm("Delete this action?")) return;
                    setSaving(true);
                    try {
                      await deleteAction(slug);
                      await useActionsStore.getState().load();
                      await useCodeStore.getState().refreshStatuses();
                      toast.success("Action deleted");
                      navigate("/actions/create", { replace: true });
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Failed to delete action",
                      );
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>

              {action.source === "builtin" ? (
                <p className="text-xs text-zinc-500">
                  Built-in actions are read-only. Create a new action with a
                  different slug if you need to customize.
                </p>
              ) : null}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Form-based editor ───────────────────────────────────────────────

function ActionFormEditor({
  action,
  onYamlChange,
}: {
  action: ActionDetail;
  onYamlChange: (yaml: string) => void;
}) {
  const [name, setName] = useState(action.name);
  const [description, setDescription] = useState(action.description);
  const [inputs, setInputs] = useState(action.inputs);
  const [tasksYaml, setTasksYaml] = useState(action.tasks_content);

  useEffect(() => {
    const obj: Record<string, unknown> = {
      slug: action.slug,
      name,
      description,
      executor: "ansible",
      source: action.source,
      compatibility: action.compatibility,
      inputs: inputs.map((i) => {
        const entry: Record<string, unknown> = { key: i.key, label: i.label };
        if (i.type && i.type !== "string") entry.type = i.type;
        if (i.placeholder) entry.placeholder = i.placeholder;
        if (i.default != null && i.default !== "") entry.default = i.default;
        if (i.required) entry.required = true;
        if (i.options?.length) entry.options = i.options;
        if (i.interactive) entry.interactive = true;
        return entry;
      }),
    };

    let tasksValue: unknown[] = [];
    try {
      tasksValue = jsYaml.load(tasksYaml) as unknown[];
    } catch {
      // keep empty
    }
    const combined = { ...obj, tasks: tasksValue || [] };
    const yaml = jsYaml.dump(combined, { sortKeys: false });
    onYamlChange(yaml);
  }, [
    name,
    description,
    inputs,
    tasksYaml,
    action.slug,
    action.source,
    action.compatibility,
    onYamlChange,
  ]);

  const updateInput = (index: number, field: string, value: unknown) => {
    setInputs((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addInput = () => {
    setInputs((prev) => [
      ...prev,
      {
        key: "",
        label: "",
        placeholder: "",
        default: "",
        type: "string",
        options: [],
        interactive: false,
        required: false,
      },
    ]);
  };

  const removeInput = (index: number) => {
    setInputs((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs text-zinc-400">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-zinc-400">Slug (read-only)</Label>
          <Input value={action.slug} disabled className="text-xs" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-zinc-400">Description</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="text-xs"
        />
      </div>

      {/* Inputs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-zinc-400">Inputs</p>
          <Button
            size="sm"
            variant="outline"
            onClick={addInput}
            className="h-6 text-[10px]"
          >
            + Add input
          </Button>
        </div>
        {inputs.map((inp, idx) => (
          <div key={idx} className="border border-zinc-800 p-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-zinc-500">Key</Label>
                <Input
                  value={inp.key}
                  onChange={(e) => updateInput(idx, "key", e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-zinc-500">Label</Label>
                <Input
                  value={inp.label}
                  onChange={(e) => updateInput(idx, "label", e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-zinc-500">Type</Label>
                <Select
                  value={inp.type ?? "string"}
                  onValueChange={(v) => updateInput(idx, "type", v)}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">string</SelectItem>
                    <SelectItem value="boolean">boolean</SelectItem>
                    <SelectItem value="select">select</SelectItem>
                    <SelectItem value="secret">secret</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-zinc-500">Default</Label>
                <Input
                  value={String(inp.default ?? "")}
                  onChange={(e) => updateInput(idx, "default", e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-zinc-500">Placeholder</Label>
                <Input
                  value={inp.placeholder}
                  onChange={(e) =>
                    updateInput(idx, "placeholder", e.target.value)
                  }
                  className="text-xs"
                />
              </div>
              <div className="flex items-end gap-3 pb-1">
                <div className="flex items-center gap-1">
                  <Checkbox
                    id={`required-${idx}`}
                    checked={inp.required ?? false}
                    onCheckedChange={(c) =>
                      updateInput(idx, "required", c === true)
                    }
                  />
                  <Label
                    htmlFor={`required-${idx}`}
                    className="text-[10px] text-zinc-500"
                  >
                    Required
                  </Label>
                </div>
                <div className="flex items-center gap-1">
                  <Checkbox
                    id={`interactive-${idx}`}
                    checked={inp.interactive ?? false}
                    onCheckedChange={(c) =>
                      updateInput(idx, "interactive", c === true)
                    }
                  />
                  <Label
                    htmlFor={`interactive-${idx}`}
                    className="text-[10px] text-zinc-500"
                  >
                    Interactive
                  </Label>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeInput(idx)}
                  className="h-6 text-[10px] text-red-400 ml-auto"
                >
                  Remove
                </Button>
              </div>
            </div>
            {inp.type === "select" ? (
              <div className="space-y-1">
                <Label className="text-[10px] text-zinc-500">
                  Options (comma-separated)
                </Label>
                <Input
                  value={(inp.options ?? []).join(", ")}
                  onChange={(e) =>
                    updateInput(
                      idx,
                      "options",
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    )
                  }
                  className="text-xs"
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Tasks YAML */}
      <div className="space-y-1">
        <Label className="text-xs text-zinc-400">Tasks (YAML)</Label>
        <Textarea
          value={tasksYaml}
          onChange={(e) => setTasksYaml(e.target.value)}
          className="font-mono text-xs min-h-[200px] bg-zinc-900 border-zinc-700 text-zinc-200 resize-y"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
