import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Network,
  Play,
  Plus,
  Search,
  Tag,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlaybooks, useHosts, useGroups } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { useTerminalWebSocket } from "@/hooks/use-terminal-websocket";
import { toastApiError } from "@/lib/api";
import { hostDisplayLabel, isManagedHost } from "@/lib/hosts";
import {
  createPlaybookRun,
  emptyTargetSelection,
  getPlaybookRequiredRuntimeVars,
  resolveTargets,
  type PlaybookRun,
  type PlaybookSummary,
  type TargetSelection,
  playbookRunStreamUrl,
} from "@/lib/playbooks";
import {
  needsRuntimeVarsDialog,
  RuntimeVarsDialog,
  type RuntimeVarField,
} from "@/components/playbooks/runtime-vars-dialog";

interface PlaybookRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostIds: string[];
  playbookId?: string;
}

type Phase = "pick" | "pick-hosts" | "running" | "done";

type TargetTab = "hosts" | "groups" | "hostvars";

type VarFilterRow = {
  id: string;
  key: string;
  mode: "equals" | "is_set";
  value: string;
};

function newVarFilterRow(): VarFilterRow {
  return {
    id: `vf_${Math.random().toString(36).slice(2, 11)}`,
    key: "",
    mode: "equals",
    value: "",
  };
}

export function PlaybookRunDialog({
  open,
  onOpenChange,
  hostIds,
  playbookId: preselectedPlaybookId,
}: PlaybookRunDialogProps) {
  const { data: playbooks = [] } = usePlaybooks();
  const { data: allHosts = [] } = useHosts();
  const { data: groups = [] } = useGroups();
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState<Phase>("pick");
  const [activeRun, setActiveRun] = useState<PlaybookRun | null>(null);
  const [selectedPlaybook, setSelectedPlaybook] =
    useState<PlaybookSummary | null>(null);
  const [runtimeFields, setRuntimeFields] = useState<RuntimeVarField[]>([]);
  const [runtimeNeedsBecome, setRuntimeNeedsBecome] = useState(false);
  const [runtimeDialogOpen, setRuntimeDialogOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [initialTerminalOutput, setInitialTerminalOutput] = useState("");

  const [selectedHostIds, setSelectedHostIds] = useState<Set<string>>(
    new Set(),
  );
  const [hostSearch, setHostSearch] = useState("");
  const [filterGroupIds, setFilterGroupIds] = useState<string[]>([]);
  const [filterLabels, setFilterLabels] = useState<string[]>([]);
  const [filterOsFamilies, setFilterOsFamilies] = useState<string[]>([]);
  const [filterSubnets, setFilterSubnets] = useState<string[]>([]);

  const [targetTab, setTargetTab] = useState<TargetTab>("hosts");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [varFilterRows, setVarFilterRows] = useState<VarFilterRow[]>([]);
  const [resolvedPreviewIds, setResolvedPreviewIds] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const renderedOutputRef = useRef("");
  const pendingTargetsRef = useRef<TargetSelection>(emptyTargetSelection());

  const hostLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of allHosts) map.set(h.id, hostDisplayLabel(h));
    return map;
  }, [allHosts]);

  const eligibleHosts = useMemo(
    () =>
      allHosts
        .filter(isManagedHost)
        .filter((h) => h.ip_address && h.ssh_user),
    [allHosts],
  );

  const allLabels = useMemo(
    () =>
      Array.from(
        new Set(eligibleHosts.flatMap((h) => h.labels ?? [])),
      ).sort(),
    [eligibleHosts],
  );

  const allOsFamilies = useMemo(() => {
    const s = new Set<string>();
    for (const h of eligibleHosts) {
      const o = h.os_family?.trim();
      if (o) s.add(o);
    }
    return Array.from(s).sort();
  }, [eligibleHosts]);

  const allSubnets = useMemo(() => {
    const s = new Set<string>();
    for (const h of eligibleHosts) {
      s.add(h.subnet?.trim() || "unknown");
    }
    return Array.from(s).sort();
  }, [eligibleHosts]);

  const knownVarKeys = useMemo(() => {
    const s = new Set<string>();
    for (const h of eligibleHosts) {
      for (const k of Object.keys(h.vars ?? {})) {
        if (k) s.add(k);
      }
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [eligibleHosts]);

  const varKeysListId = useMemo(
    () => `playbook-run-var-keys-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  const filteredHosts = useMemo(() => {
    return eligibleHosts.filter((h) => {
      if (hostSearch) {
        const q = hostSearch.toLowerCase();
        const searchable = [
          h.name,
          h.hostname,
          h.ip_address,
          h.os_family,
          ...(h.labels ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      if (filterGroupIds.length > 0) {
        if (!filterGroupIds.some((gid) => (h.groups ?? []).includes(gid)))
          return false;
      }
      if (filterLabels.length > 0) {
        if (!filterLabels.some((l) => (h.labels ?? []).includes(l)))
          return false;
      }
      if (filterOsFamilies.length > 0) {
        const fam = h.os_family?.trim() ?? "";
        if (!filterOsFamilies.includes(fam)) return false;
      }
      if (filterSubnets.length > 0) {
        const sub = h.subnet?.trim() || "unknown";
        if (!filterSubnets.includes(sub)) return false;
      }
      return true;
    });
  }, [
    eligibleHosts,
    hostSearch,
    filterGroupIds,
    filterLabels,
    filterOsFamilies,
    filterSubnets,
  ]);

  const groupMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) map.set(g.id, g.name);
    return map;
  }, [groups]);

  const activeGroups = useMemo(() => {
    const ids = new Set<string>();
    for (const h of eligibleHosts)
      for (const gid of h.groups ?? []) ids.add(gid);
    return groups.filter((g) => ids.has(g.id));
  }, [groups, eligibleHosts]);

  const groupMemberCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) m.set(g.id, 0);
    for (const h of eligibleHosts) {
      for (const gid of h.groups ?? []) {
        m.set(gid, (m.get(gid) ?? 0) + 1);
      }
    }
    return m;
  }, [groups, eligibleHosts]);

  const filtered = useMemo(() => {
    if (!search) return playbooks;
    const q = search.toLowerCase();
    return playbooks.filter((p) => p.name.toLowerCase().includes(q));
  }, [playbooks, search]);

  const buildTargets = useCallback((): TargetSelection | null => {
    if (targetTab === "hosts") {
      if (selectedHostIds.size === 0) return null;
      return { ...emptyTargetSelection(), hosts: [...selectedHostIds] };
    }
    if (targetTab === "groups") {
      if (selectedGroupIds.length === 0) return null;
      return { ...emptyTargetSelection(), groups: [...selectedGroupIds] };
    }
    const vf = varFilterRows
      .filter((r) => r.key.trim())
      .map((r) => ({
        key: r.key.trim(),
        value:
          r.mode === "is_set" || r.value.trim() === ""
            ? null
            : r.value.trim(),
      }));
    if (vf.length === 0) return null;
    return { ...emptyTargetSelection(), var_filters: vf };
  }, [targetTab, selectedHostIds, selectedGroupIds, varFilterRows]);

  const canRun = useMemo(() => {
    if (starting) return false;
    if (targetTab === "hosts") return selectedHostIds.size > 0;
    if (targetTab === "groups") {
      return (
        selectedGroupIds.length > 0 &&
        !previewLoading &&
        resolvedPreviewIds.length > 0
      );
    }
    const hasFilters = varFilterRows.some((r) => r.key.trim());
    return (
      hasFilters && !previewLoading && resolvedPreviewIds.length > 0
    );
  }, [
    starting,
    targetTab,
    selectedHostIds,
    selectedGroupIds,
    varFilterRows,
    previewLoading,
    resolvedPreviewIds.length,
  ]);

  const runHostCount =
    targetTab === "hosts" ? selectedHostIds.size : resolvedPreviewIds.length;

  useEffect(() => {
    if (!open) {
      setPhase("pick");
      setActiveRun(null);
      setSelectedPlaybook(null);
      setSearch("");
      setRuntimeFields([]);
      setRuntimeNeedsBecome(false);
      setStarting(false);
      setInitialTerminalOutput("");
      setSelectedHostIds(new Set());
      setHostSearch("");
      setFilterGroupIds([]);
      setFilterLabels([]);
      setFilterOsFamilies([]);
      setFilterSubnets([]);
      setTargetTab("hosts");
      setSelectedGroupIds([]);
      setVarFilterRows([]);
      setResolvedPreviewIds([]);
      setPreviewLoading(false);
      setPreviewExpanded(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || phase !== "pick-hosts") return;
    if (targetTab === "hosts") {
      setResolvedPreviewIds([]);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;

    const toApiVarFilters = () =>
      varFilterRows
        .filter((r) => r.key.trim())
        .map((r) => ({
          key: r.key.trim(),
          value:
            r.mode === "is_set" || r.value.trim() === ""
              ? null
              : r.value.trim(),
        }));

    void (async () => {
      if (targetTab === "groups") {
        if (selectedGroupIds.length === 0) {
          if (!cancelled) {
            setResolvedPreviewIds([]);
            setPreviewLoading(false);
          }
          return;
        }
        if (!cancelled) setPreviewLoading(true);
        try {
          const { hosts } = await resolveTargets({
            ...emptyTargetSelection(),
            groups: selectedGroupIds,
          });
          if (!cancelled) setResolvedPreviewIds(hosts);
        } catch {
          if (!cancelled) setResolvedPreviewIds([]);
        } finally {
          if (!cancelled) setPreviewLoading(false);
        }
        return;
      }

      const vf = toApiVarFilters();
      if (vf.length === 0) {
        if (!cancelled) {
          setResolvedPreviewIds([]);
          setPreviewLoading(false);
        }
        return;
      }
      if (!cancelled) setPreviewLoading(true);
      try {
        const { hosts } = await resolveTargets({
          ...emptyTargetSelection(),
          var_filters: vf,
        });
        if (!cancelled) setResolvedPreviewIds(hosts);
      } catch {
        if (!cancelled) setResolvedPreviewIds([]);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, phase, targetTab, selectedGroupIds, varFilterRows]);

  useEffect(() => {
    if (!open || !preselectedPlaybookId) return;
    const pb = playbooks.find((p) => p.id === preselectedPlaybookId);
    if (!pb) return;
    setSelectedPlaybook(pb);
    setPhase("pick-hosts");
    getPlaybookRequiredRuntimeVars(pb.id)
      .then((req) => {
        setRuntimeFields(req.inputs);
        setRuntimeNeedsBecome(req.needs_become_password);
      })
      .catch(() => {});
  }, [open, preselectedPlaybookId, playbooks]);

  useEffect(() => {
    setPreviewExpanded(false);
  }, [targetTab]);

  const startRun = useCallback(
    async (
      playbookId: string,
      targets: TargetSelection,
      runtimeVars?: Record<string, string>,
      becomePassword?: string | null,
    ) => {
      setStarting(true);
      setPhase("running");
      try {
        const result = await createPlaybookRun(playbookId, {
          targets,
          runtime_vars:
            runtimeVars && Object.keys(runtimeVars).length > 0
              ? runtimeVars
              : undefined,
          become_password: becomePassword ?? undefined,
        });
        setActiveRun(result.run);
        setInitialTerminalOutput(result.run.output ?? "");
        toast.success("Playbook started");
      } catch (error) {
        toastApiError(error, "Failed to start playbook");
        setPhase(preselectedPlaybookId ? "pick-hosts" : "pick");
      } finally {
        setStarting(false);
      }
    },
    [preselectedPlaybookId],
  );

  const handleSelectPlaybook = useCallback(
    async (pb: PlaybookSummary) => {
      setSelectedPlaybook(pb);
      try {
        const req = await getPlaybookRequiredRuntimeVars(pb.id);
        setRuntimeFields(req.inputs);
        setRuntimeNeedsBecome(req.needs_become_password);
        pendingTargetsRef.current = {
          ...emptyTargetSelection(),
          hosts: [...hostIds],
        };

        if (needsRuntimeVarsDialog(req.inputs, req.needs_become_password)) {
          setRuntimeDialogOpen(true);
        } else {
          await startRun(pb.id, pendingTargetsRef.current);
        }
      } catch (error) {
        toastApiError(error, "Failed to load playbook");
      }
    },
    [startRun, hostIds],
  );

  const handleConfirmRun = useCallback(async () => {
    if (!selectedPlaybook) return;
    const targets = buildTargets();
    if (!targets) return;
    pendingTargetsRef.current = targets;
    if (needsRuntimeVarsDialog(runtimeFields, runtimeNeedsBecome)) {
      setRuntimeDialogOpen(true);
    } else {
      await startRun(selectedPlaybook.id, targets);
    }
  }, [
    selectedPlaybook,
    buildTargets,
    runtimeFields,
    runtimeNeedsBecome,
    startRun,
  ]);

  const toggleHost = useCallback((hostId: string) => {
    setSelectedHostIds((prev) => {
      const next = new Set(prev);
      if (next.has(hostId)) next.delete(hostId);
      else next.add(hostId);
      return next;
    });
  }, []);

  const toggleAllFiltered = useCallback(() => {
    setSelectedHostIds((prev) => {
      const ids = filteredHosts.map((h) => h.id);
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [filteredHosts]);

  const toggleGroupTarget = useCallback((groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((g) => g !== groupId)
        : [...prev, groupId],
    );
  }, []);

  const handlePlaybookMessage = useCallback(
    (payload: unknown, terminal: import("xterm").Terminal) => {
      const p = payload as {
        type?: string;
        run?: PlaybookRun;
        data?: string;
        message?: string;
      };
      if (p.type === "error") {
        toast.error(p.message ?? "Playbook run error");
        return;
      }
      if (p.type === "snapshot" || p.type === "status") {
        if (p.run) {
          setActiveRun(p.run);
          if (p.run.status === "completed" || p.run.status === "failed") {
            setPhase("done");
          }
          if (p.run.output !== renderedOutputRef.current) {
            terminal.clear();
            if (p.run.output) terminal.write(String(p.run.output));
            renderedOutputRef.current = String(p.run.output || "");
          }
        }
      }
      if (p.type === "output") {
        const chunk = String(p.data ?? "");
        terminal.write(chunk);
        renderedOutputRef.current += chunk;
        setActiveRun((cur) =>
          cur ? { ...cur, output: `${cur.output}${chunk}` } : cur,
        );
      }
    },
    [],
  );

  const handlePlaybookError = useCallback(() => {
    // Suppress — the run already completed; server just closed the socket.
  }, []);

  useTerminalWebSocket({
    containerRef: terminalHostRef,
    url:
      activeRun && (phase === "running" || phase === "done")
        ? playbookRunStreamUrl(activeRun.id)
        : null,
    interactive: false,
    initialOutput: initialTerminalOutput,
    onMessage: handlePlaybookMessage,
    onError: handlePlaybookError,
  });

  const statusLabel = activeRun
    ? activeRun.status === "queued"
      ? "Queued"
      : activeRun.status === "running"
        ? "Running..."
        : activeRun.status === "completed"
          ? "Completed"
          : "Failed"
    : "";

  const statusColor =
    activeRun?.status === "completed"
      ? "text-emerald-400"
      : activeRun?.status === "failed"
        ? "text-red-400"
        : "text-zinc-400";

  const filterPopoverButtonClass = (active: boolean) =>
    cn(
      "h-8 gap-1.5 text-[11px] shrink-0",
      active ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-300",
    );

  return (
    <>
      <RuntimeVarsDialog
        open={runtimeDialogOpen}
        fields={runtimeFields}
        needsBecomePassword={runtimeNeedsBecome}
        onConfirm={async (vars, becomePassword) => {
          if (selectedPlaybook)
            await startRun(
              selectedPlaybook.id,
              pendingTargetsRef.current,
              vars,
              becomePassword,
            );
          setRuntimeDialogOpen(false);
        }}
        onCancel={() => {
          setRuntimeDialogOpen(false);
          if (!preselectedPlaybookId) setSelectedPlaybook(null);
        }}
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[75vw] max-h-[85vh] flex flex-col">
          {phase === "pick" && (
            <>
              <DialogHeader>
                <DialogTitle>Run playbook</DialogTitle>
                <DialogDescription>
                  Select a playbook to run against {hostIds.length} host
                  {hostIds.length !== 1 ? "s" : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {hostIds.slice(0, 20).map((id) => (
                  <Badge key={id} variant="outline" className="text-[10px]">
                    {hostLabels.get(id) ?? id}
                  </Badge>
                ))}
                {hostIds.length > 20 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{hostIds.length - 20} more
                  </Badge>
                )}
              </div>

              {playbooks.length > 5 && (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-zinc-500" />
                  <Input
                    autoFocus
                    placeholder="Search playbooks..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-7 h-8 text-xs"
                  />
                </div>
              )}

              <div className="max-h-56 overflow-y-auto -mx-1 space-y-0.5">
                {filtered.length === 0 ? (
                  <p className="py-6 text-center text-xs text-zinc-500">
                    No playbooks found
                  </p>
                ) : (
                  filtered.map((pb) => (
                    <button
                      key={pb.id}
                      type="button"
                      disabled={starting}
                      onClick={() => handleSelectPlaybook(pb)}
                      className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/60 disabled:opacity-50"
                    >
                      <Play className="size-3.5 text-zinc-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-zinc-200 truncate">
                          {pb.name}
                        </p>
                        {pb.description && (
                          <p className="text-[11px] text-zinc-500 truncate">
                            {pb.description}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-600 shrink-0">
                        {pb.roles.length} role{pb.roles.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>

              {starting && (
                <div className="flex items-center justify-center gap-2 py-2 text-xs text-zinc-500">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  Starting...
                </div>
              )}
            </>
          )}

          {phase === "pick-hosts" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Run: {selectedPlaybook?.name ?? "Playbook"}
                </DialogTitle>
                <DialogDescription>
                  Choose how to select hosts, then run
                </DialogDescription>
              </DialogHeader>

              <Tabs
                value={targetTab}
                onValueChange={(v) => setTargetTab(v as TargetTab)}
                className="flex min-h-0 flex-1 flex-col gap-2"
              >
                <TabsList variant="line" className="w-full justify-start">
                  <TabsTrigger value="hosts">Hosts</TabsTrigger>
                  <TabsTrigger value="groups">Groups</TabsTrigger>
                  <TabsTrigger value="hostvars">Host vars</TabsTrigger>
                </TabsList>

                <TabsContent value="hosts" className="mt-0 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[12rem] flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-zinc-500" />
                      <Input
                        autoFocus
                        placeholder="Search hosts…"
                        value={hostSearch}
                        onChange={(e) => setHostSearch(e.target.value)}
                        className="pl-7 h-8 text-xs"
                      />
                    </div>

                    {activeGroups.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={filterPopoverButtonClass(
                              filterGroupIds.length > 0,
                            )}
                          >
                            <Users className="size-3" />
                            Groups
                            {filterGroupIds.length > 0 && (
                              <span className="flex size-4 items-center justify-center rounded-sm bg-zinc-700 text-[9px] font-medium text-zinc-200">
                                {filterGroupIds.length}
                              </span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-52 p-1"
                          sideOffset={6}
                        >
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {activeGroups.map((g) => {
                              const isSelected = filterGroupIds.includes(g.id);
                              return (
                                <button
                                  key={g.id}
                                  type="button"
                                  onClick={() =>
                                    setFilterGroupIds((prev) =>
                                      isSelected
                                        ? prev.filter((v) => v !== g.id)
                                        : [...prev, g.id],
                                    )
                                  }
                                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-zinc-800/60"
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    className="pointer-events-none size-3"
                                  />
                                  <span
                                    className={cn(
                                      "truncate",
                                      isSelected
                                        ? "text-zinc-100"
                                        : "text-zinc-400",
                                    )}
                                  >
                                    {g.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {filterGroupIds.length > 0 && (
                            <div className="border-t border-zinc-800 mt-1 pt-1">
                              <button
                                type="button"
                                onClick={() => setFilterGroupIds([])}
                                className="flex w-full items-center justify-center gap-1 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                              >
                                <X className="size-2.5" />
                                Clear
                              </button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}

                    {allLabels.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={filterPopoverButtonClass(
                              filterLabels.length > 0,
                            )}
                          >
                            <Tag className="size-3" />
                            Labels
                            {filterLabels.length > 0 && (
                              <span className="flex size-4 items-center justify-center rounded-sm bg-zinc-700 text-[9px] font-medium text-zinc-200">
                                {filterLabels.length}
                              </span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-52 p-1"
                          sideOffset={6}
                        >
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {allLabels.map((label) => {
                              const isSelected = filterLabels.includes(label);
                              return (
                                <button
                                  key={label}
                                  type="button"
                                  onClick={() =>
                                    setFilterLabels((prev) =>
                                      isSelected
                                        ? prev.filter((v) => v !== label)
                                        : [...prev, label],
                                    )
                                  }
                                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-zinc-800/60"
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    className="pointer-events-none size-3"
                                  />
                                  <span
                                    className={cn(
                                      "truncate",
                                      isSelected
                                        ? "text-zinc-100"
                                        : "text-zinc-400",
                                    )}
                                  >
                                    {label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {filterLabels.length > 0 && (
                            <div className="border-t border-zinc-800 mt-1 pt-1">
                              <button
                                type="button"
                                onClick={() => setFilterLabels([])}
                                className="flex w-full items-center justify-center gap-1 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                              >
                                <X className="size-2.5" />
                                Clear
                              </button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}

                    {allOsFamilies.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={filterPopoverButtonClass(
                              filterOsFamilies.length > 0,
                            )}
                          >
                            OS
                            {filterOsFamilies.length > 0 && (
                              <span className="flex size-4 items-center justify-center rounded-sm bg-zinc-700 text-[9px] font-medium text-zinc-200">
                                {filterOsFamilies.length}
                              </span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-52 p-1"
                          sideOffset={6}
                        >
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {allOsFamilies.map((fam) => {
                              const isSelected =
                                filterOsFamilies.includes(fam);
                              return (
                                <button
                                  key={fam}
                                  type="button"
                                  onClick={() =>
                                    setFilterOsFamilies((prev) =>
                                      isSelected
                                        ? prev.filter((v) => v !== fam)
                                        : [...prev, fam],
                                    )
                                  }
                                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-zinc-800/60"
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    className="pointer-events-none size-3"
                                  />
                                  <span
                                    className={cn(
                                      "truncate",
                                      isSelected
                                        ? "text-zinc-100"
                                        : "text-zinc-400",
                                    )}
                                  >
                                    {fam}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {filterOsFamilies.length > 0 && (
                            <div className="border-t border-zinc-800 mt-1 pt-1">
                              <button
                                type="button"
                                onClick={() => setFilterOsFamilies([])}
                                className="flex w-full items-center justify-center gap-1 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                              >
                                <X className="size-2.5" />
                                Clear
                              </button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}

                    {allSubnets.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={filterPopoverButtonClass(
                              filterSubnets.length > 0,
                            )}
                          >
                            <Network className="size-3" />
                            Subnet
                            {filterSubnets.length > 0 && (
                              <span className="flex size-4 items-center justify-center rounded-sm bg-zinc-700 text-[9px] font-medium text-zinc-200">
                                {filterSubnets.length}
                              </span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-52 p-1"
                          sideOffset={6}
                        >
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {allSubnets.map((sub) => {
                              const isSelected =
                                filterSubnets.includes(sub);
                              return (
                                <button
                                  key={sub}
                                  type="button"
                                  onClick={() =>
                                    setFilterSubnets((prev) =>
                                      isSelected
                                        ? prev.filter((v) => v !== sub)
                                        : [...prev, sub],
                                    )
                                  }
                                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-zinc-800/60"
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    className="pointer-events-none size-3"
                                  />
                                  <span
                                    className={cn(
                                      "truncate font-mono",
                                      isSelected
                                        ? "text-zinc-100"
                                        : "text-zinc-400",
                                    )}
                                  >
                                    {sub}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {filterSubnets.length > 0 && (
                            <div className="border-t border-zinc-800 mt-1 pt-1">
                              <button
                                type="button"
                                onClick={() => setFilterSubnets([])}
                                className="flex w-full items-center justify-center gap-1 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                              >
                                <X className="size-2.5" />
                                Clear
                              </button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>

                  {(filterGroupIds.length > 0 ||
                    filterLabels.length > 0 ||
                    filterOsFamilies.length > 0 ||
                    filterSubnets.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1">
                      {filterGroupIds.map((gid) => (
                        <Badge
                          key={gid}
                          variant="secondary"
                          className="gap-1 text-[10px] px-1.5 py-0 cursor-pointer hover:bg-zinc-700"
                          onClick={() =>
                            setFilterGroupIds((prev) =>
                              prev.filter((v) => v !== gid),
                            )
                          }
                        >
                          <Users className="size-2.5" />
                          {groupMap.get(gid) ?? gid}
                          <X className="size-2.5" />
                        </Badge>
                      ))}
                      {filterLabels.map((label) => (
                        <Badge
                          key={label}
                          variant="secondary"
                          className="gap-1 text-[10px] px-1.5 py-0 cursor-pointer hover:bg-zinc-700"
                          onClick={() =>
                            setFilterLabels((prev) =>
                              prev.filter((v) => v !== label),
                            )
                          }
                        >
                          <Tag className="size-2.5" />
                          {label}
                          <X className="size-2.5" />
                        </Badge>
                      ))}
                      {filterOsFamilies.map((fam) => (
                        <Badge
                          key={fam}
                          variant="secondary"
                          className="gap-1 text-[10px] px-1.5 py-0 cursor-pointer hover:bg-zinc-700"
                          onClick={() =>
                            setFilterOsFamilies((prev) =>
                              prev.filter((v) => v !== fam),
                            )
                          }
                        >
                          OS:{fam}
                          <X className="size-2.5" />
                        </Badge>
                      ))}
                      {filterSubnets.map((sub) => (
                        <Badge
                          key={sub}
                          variant="secondary"
                          className="gap-1 text-[10px] px-1.5 py-0 cursor-pointer hover:bg-zinc-700 font-mono"
                          onClick={() =>
                            setFilterSubnets((prev) =>
                              prev.filter((v) => v !== sub),
                            )
                          }
                        >
                          {sub}
                          <X className="size-2.5" />
                        </Badge>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setFilterGroupIds([]);
                          setFilterLabels([]);
                          setFilterOsFamilies([]);
                          setFilterSubnets([]);
                        }}
                        className="text-[10px] text-zinc-600 hover:text-zinc-400 ml-1"
                      >
                        Clear all
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 px-1">
                    <Checkbox
                      checked={
                        filteredHosts.length > 0 &&
                        filteredHosts.every((h) =>
                          selectedHostIds.has(h.id),
                        )
                      }
                      onCheckedChange={toggleAllFiltered}
                    />
                    <span className="text-xs text-zinc-400">
                      Select all ({selectedHostIds.size} of{" "}
                      {eligibleHosts.length})
                    </span>
                  </div>

                  <div className="max-h-64 overflow-y-auto -mx-1 space-y-0.5">
                    {filteredHosts.length === 0 ? (
                      <p className="py-6 text-center text-xs text-zinc-500">
                        No hosts found
                      </p>
                    ) : (
                      filteredHosts.map((h) => (
                        <label
                          key={h.id}
                          className="flex w-full items-center gap-3 rounded-sm px-3 py-2 cursor-pointer transition-colors hover:bg-zinc-800/60"
                        >
                          <Checkbox
                            checked={selectedHostIds.has(h.id)}
                            onCheckedChange={() => toggleHost(h.id)}
                          />
                          <div className="min-w-0 flex-1 flex items-center gap-3">
                            <span className="text-sm text-zinc-200 truncate min-w-0 flex-1">
                              {hostDisplayLabel(h)}
                            </span>
                            {h.ip_address && (
                              <span className="text-[11px] text-zinc-500 shrink-0 font-mono">
                                {h.ip_address}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0 flex-wrap justify-end max-w-[40%]">
                            {(h.groups ?? []).slice(0, 2).map((gid) => (
                              <Badge
                                key={`g-${gid}`}
                                variant="outline"
                                className="text-[9px] px-1 py-0"
                              >
                                {groupMap.get(gid) ?? gid}
                              </Badge>
                            ))}
                            {(h.labels ?? []).slice(0, 2).map((label) => (
                              <Badge
                                key={`l-${label}`}
                                variant="outline"
                                className="text-[9px] px-1 py-0 border-zinc-700 text-zinc-500"
                              >
                                {label}
                              </Badge>
                            ))}
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="groups" className="mt-0 flex flex-col gap-2">
                  <p className="text-[11px] text-zinc-500">
                    Run against every managed host in the selected groups
                    (combined).
                  </p>
                  <div className="max-h-56 overflow-y-auto space-y-0.5 rounded-sm border border-zinc-800/80 p-1">
                    {groups.length === 0 ? (
                      <p className="py-6 text-center text-xs text-zinc-500">
                        No groups defined
                      </p>
                    ) : (
                      groups.map((g) => {
                        const count = groupMemberCounts.get(g.id) ?? 0;
                        const isSelected = selectedGroupIds.includes(g.id);
                        return (
                          <label
                            key={g.id}
                            className="flex w-full cursor-pointer items-center gap-3 rounded-sm px-2 py-2 hover:bg-zinc-800/60"
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleGroupTarget(g.id)}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                              {g.name}
                            </span>
                            <Badge variant="outline" className="text-[9px] shrink-0">
                              {count} host{count !== 1 ? "s" : ""}
                            </Badge>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <div className="rounded-sm border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-zinc-300">
                      {previewLoading && (
                        <LoaderCircle className="size-3.5 animate-spin text-zinc-500" />
                      )}
                      {!previewLoading && selectedGroupIds.length === 0 && (
                        <span className="text-zinc-500">
                          Select at least one group
                        </span>
                      )}
                      {!previewLoading &&
                        selectedGroupIds.length > 0 &&
                        resolvedPreviewIds.length === 0 && (
                          <span className="text-amber-500/90">
                            No managed SSH hosts match
                          </span>
                        )}
                      {!previewLoading && resolvedPreviewIds.length > 0 && (
                        <span>
                          {resolvedPreviewIds.length} host
                          {resolvedPreviewIds.length !== 1 ? "s" : ""} will be
                          targeted
                        </span>
                      )}
                    </div>
                    {resolvedPreviewIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPreviewExpanded((v) => !v)}
                        className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                      >
                        {previewExpanded ? (
                          <ChevronDown className="size-3" />
                        ) : (
                          <ChevronRight className="size-3" />
                        )}
                        Show hosts
                      </button>
                    )}
                    {previewExpanded && resolvedPreviewIds.length > 0 && (
                      <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto border-t border-zinc-800 pt-2 font-mono text-[10px] text-zinc-400">
                        {resolvedPreviewIds.map((id) => (
                          <li key={id}>
                            {hostLabels.get(id) ?? id}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </TabsContent>

                <TabsContent
                  value="hostvars"
                  className="mt-0 flex flex-col gap-2"
                >
                  <p className="text-[11px] text-zinc-500">
                    Match hosts where every condition holds (AND). Use
                    &quot;is set&quot; when the key exists.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-[11px]"
                      onClick={() =>
                        setVarFilterRows((rows) => [...rows, newVarFilterRow()])
                      }
                    >
                      <Plus className="size-3" />
                      Add condition
                    </Button>
                    {varFilterRows.length > 0 && (
                      <button
                        type="button"
                        className="text-[10px] text-zinc-600 hover:text-zinc-400"
                        onClick={() => setVarFilterRows([])}
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <datalist id={varKeysListId}>
                    {knownVarKeys.map((k) => (
                      <option key={k} value={k} />
                    ))}
                  </datalist>
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {varFilterRows.length === 0 ? (
                      <p className="py-4 text-center text-xs text-zinc-500">
                        No conditions — add one to filter by inventory variable
                      </p>
                    ) : (
                      varFilterRows.map((row, idx) => (
                        <div
                          key={row.id}
                          className="flex flex-wrap items-center gap-2 rounded-sm border border-zinc-800/80 bg-zinc-900/30 px-2 py-2"
                        >
                          <span className="w-5 text-[10px] text-zinc-600">
                            {idx + 1}.
                          </span>
                          <Input
                            placeholder="var key"
                            value={row.key}
                            list={varKeysListId}
                            onChange={(e) =>
                              setVarFilterRows((rows) =>
                                rows.map((r) =>
                                  r.id === row.id
                                    ? { ...r, key: e.target.value }
                                    : r,
                                ),
                              )
                            }
                            className="h-8 min-w-[7rem] flex-1 text-xs font-mono"
                          />
                          <Select
                            value={row.mode}
                            onValueChange={(v) =>
                              setVarFilterRows((rows) =>
                                rows.map((r) =>
                                  r.id === row.id
                                    ? {
                                        ...r,
                                        mode: v as "equals" | "is_set",
                                      }
                                    : r,
                                ),
                              )
                            }
                          >
                            <SelectTrigger size="sm" className="w-[6.5rem] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="equals">equals</SelectItem>
                              <SelectItem value="is_set">is set</SelectItem>
                            </SelectContent>
                          </Select>
                          {row.mode === "equals" && (
                            <Input
                              placeholder="value"
                              value={row.value}
                              onChange={(e) =>
                                setVarFilterRows((rows) =>
                                  rows.map((r) =>
                                    r.id === row.id
                                      ? { ...r, value: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                              className="h-8 min-w-[6rem] flex-1 text-xs"
                            />
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 text-zinc-500"
                            onClick={() =>
                              setVarFilterRows((rows) =>
                                rows.filter((r) => r.id !== row.id),
                              )
                            }
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="rounded-sm border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-zinc-300">
                      {previewLoading && (
                        <LoaderCircle className="size-3.5 animate-spin text-zinc-500" />
                      )}
                      {!previewLoading &&
                        !varFilterRows.some((r) => r.key.trim()) && (
                          <span className="text-zinc-500">
                            Add at least one var key
                          </span>
                        )}
                      {!previewLoading &&
                        varFilterRows.some((r) => r.key.trim()) &&
                        resolvedPreviewIds.length === 0 && (
                          <span className="text-amber-500/90">
                            No hosts match these conditions
                          </span>
                        )}
                      {!previewLoading && resolvedPreviewIds.length > 0 && (
                        <span>
                          {resolvedPreviewIds.length} host
                          {resolvedPreviewIds.length !== 1 ? "s" : ""} match
                        </span>
                      )}
                    </div>
                    {resolvedPreviewIds.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewExpanded((v) => !v)}
                          className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                        >
                          {previewExpanded ? (
                            <ChevronDown className="size-3" />
                          ) : (
                            <ChevronRight className="size-3" />
                          )}
                          Show hosts
                        </button>
                        {previewExpanded && (
                          <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto border-t border-zinc-800 pt-2 font-mono text-[10px] text-zinc-400">
                            {resolvedPreviewIds.map((id) => (
                              <li key={id}>
                                {hostLabels.get(id) ?? id}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!canRun}
                  onClick={() => void handleConfirmRun()}
                >
                  {starting ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  Run on {runHostCount} host{runHostCount !== 1 ? "s" : ""}
                </Button>
              </DialogFooter>
            </>
          )}

          {(phase === "running" || phase === "done") && activeRun && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedPlaybook?.name ?? "Playbook run"}
                  {(activeRun.status === "running" ||
                    activeRun.status === "queued") && (
                    <LoaderCircle className="size-3.5 animate-spin text-zinc-400" />
                  )}
                </DialogTitle>
                <DialogDescription>
                  <span className={statusColor}>{statusLabel}</span>
                  {" · "}
                  {activeRun.hosts.length} host
                  {activeRun.hosts.length !== 1 ? "s" : ""}
                  {activeRun.exit_code !== null &&
                    ` · exit ${activeRun.exit_code}`}
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 min-h-0 border border-zinc-800 bg-zinc-950 p-2">
                <div
                  ref={terminalHostRef}
                  className="h-full w-full min-h-[24rem] overflow-hidden"
                />
              </div>

              <DialogFooter className="flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  {phase === "done"
                    ? "Close"
                    : "Close (run continues in background)"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
