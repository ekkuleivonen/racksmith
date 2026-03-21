import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LoaderCircle,
  Play,
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
import { usePlaybooks, useHosts, useGroups } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { useTerminalWebSocket } from "@/hooks/use-terminal-websocket";
import { toastApiError } from "@/lib/api";
import { hostDisplayLabel, isManagedHost } from "@/lib/hosts";
import {
  createPlaybookRun,
  getPlaybookRequiredRuntimeVars,
  type PlaybookRun,
  type PlaybookSummary,
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

  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const renderedOutputRef = useRef("");
  const pendingTargetsRef = useRef<string[]>([]);

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
    () => Array.from(new Set(eligibleHosts.flatMap((h) => h.labels ?? []))).sort(),
    [eligibleHosts],
  );

  const filteredHosts = useMemo(() => {
    return eligibleHosts.filter((h) => {
      if (hostSearch) {
        const q = hostSearch.toLowerCase();
        if (
          ![h.name, h.hostname, h.ip_address]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
          return false;
      }
      if (filterGroupIds.length > 0) {
        if (!filterGroupIds.some((gid) => (h.groups ?? []).includes(gid)))
          return false;
      }
      if (filterLabels.length > 0) {
        if (!filterLabels.some((l) => (h.labels ?? []).includes(l)))
          return false;
      }
      return true;
    });
  }, [eligibleHosts, hostSearch, filterGroupIds, filterLabels]);

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

  const filtered = useMemo(() => {
    if (!search) return playbooks;
    const q = search.toLowerCase();
    return playbooks.filter((p) => p.name.toLowerCase().includes(q));
  }, [playbooks, search]);

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
    }
  }, [open]);

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

  const startRun = useCallback(
    async (
      playbookId: string,
      targetHosts: string[],
      runtimeVars?: Record<string, string>,
      becomePassword?: string | null,
    ) => {
      setStarting(true);
      setPhase("running");
      try {
        const result = await createPlaybookRun(playbookId, {
          targets: { hosts: targetHosts, groups: [], labels: [], racks: [] },
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
        pendingTargetsRef.current = hostIds;

        if (needsRuntimeVarsDialog(req.inputs, req.needs_become_password)) {
          setRuntimeDialogOpen(true);
        } else {
          await startRun(pb.id, hostIds);
        }
      } catch (error) {
        toastApiError(error, "Failed to load playbook");
      }
    },
    [startRun, hostIds],
  );

  const handleRunWithSelectedHosts = useCallback(async () => {
    if (!selectedPlaybook || selectedHostIds.size === 0) return;
    const targets = [...selectedHostIds];
    pendingTargetsRef.current = targets;

    if (needsRuntimeVarsDialog(runtimeFields, runtimeNeedsBecome)) {
      setRuntimeDialogOpen(true);
    } else {
      await startRun(selectedPlaybook.id, targets);
    }
  }, [selectedPlaybook, selectedHostIds, runtimeFields, runtimeNeedsBecome, startRun]);

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


  const handlePlaybookMessage = useCallback((payload: unknown, terminal: import("xterm").Terminal) => {
    const p = payload as { type?: string; run?: PlaybookRun; data?: string; message?: string };
    if (p.type === "error") {
      toast.error(p.message ?? "Playbook run error");
      return;
    }
    if (p.type === "snapshot" || p.type === "status") {
      if (p.run) {
        setActiveRun(p.run);
        if (
          p.run.status === "completed" ||
          p.run.status === "failed"
        ) {
          setPhase("done");
        }
        if (
          p.run.output !== renderedOutputRef.current
        ) {
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
  }, []);

  useTerminalWebSocket({
    containerRef: terminalHostRef,
    url: activeRun && (phase === "running" || phase === "done")
      ? playbookRunStreamUrl(activeRun.id)
      : null,
    interactive: false,
    initialOutput: initialTerminalOutput,
    onMessage: handlePlaybookMessage,
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
                  Select which hosts to run this playbook against
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-zinc-500" />
                  <Input
                    autoFocus
                    placeholder="Search hosts..."
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
                        className={cn(
                          "h-8 gap-1.5 text-[11px] shrink-0",
                          filterGroupIds.length > 0
                            ? "text-zinc-200"
                            : "text-zinc-500 hover:text-zinc-300",
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
                    <PopoverContent align="start" className="w-52 p-1" sideOffset={6}>
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
                        className={cn(
                          "h-8 gap-1.5 text-[11px] shrink-0",
                          filterLabels.length > 0
                            ? "text-zinc-200"
                            : "text-zinc-500 hover:text-zinc-300",
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
                    <PopoverContent align="start" className="w-52 p-1" sideOffset={6}>
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
              </div>

              {(filterGroupIds.length > 0 || filterLabels.length > 0) && (
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
                  <button
                    type="button"
                    onClick={() => {
                      setFilterGroupIds([]);
                      setFilterLabels([]);
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
                    filteredHosts.every((h) => selectedHostIds.has(h.id))
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
                      <div className="flex gap-1 shrink-0">
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
                  disabled={selectedHostIds.size === 0 || starting}
                  onClick={handleRunWithSelectedHosts}
                >
                  {starting ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  Run on {selectedHostIds.size} host
                  {selectedHostIds.size !== 1 ? "s" : ""}
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
