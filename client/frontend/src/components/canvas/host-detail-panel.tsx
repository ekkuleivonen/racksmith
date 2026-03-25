import { useMemo, useRef, useState } from "react";
import {
  Locate,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { EditableSection } from "@/components/shared/editable-section";
import { KeyValueEditor } from "@/components/shared/key-value-editor";
import {
  varsToRows,
  rowsToVars,
  type VarRow,
} from "@/components/shared/key-value-editor-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SSH_PORT_FALLBACK } from "@/lib/defaults";
import { isReachableHost, type Host, type HostInput } from "@/lib/hosts";
import { hostStatusDotClass } from "@/components/shared/host-status-dot";
import type { PingStatus } from "@/lib/ssh";
import type { Group } from "@/lib/groups";
import { cn } from "@/lib/utils";
import { useDefaults } from "@/hooks/queries";
import {
  useDeleteHost,
  useRebootHost,
  useRefreshHost,
  useRelocateHost,
  useUpdateHost,
} from "@/hooks/mutations";
function useAppSshPort(): number {
  const { data } = useDefaults();
  return data?.ssh_port ?? SSH_PORT_FALLBACK;
}

function buildUpdatePayload(
  host: Host,
  patch: Partial<HostInput>,
  defaultSshPort: number,
): HostInput {
  return {
    name: host.name ?? "",
    ip_address: host.ip_address ?? "",
    ssh_user: host.ssh_user ?? "",
    ssh_port: host.ssh_port ?? defaultSshPort,
    labels: host.labels ?? [],
    groups: host.groups ?? [],
    vars: host.vars ?? {},
    ...patch,
  };
}

export function PingBadge({ status }: { status: PingStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-zinc-700 text-[10px]",
        status === "online" && "border-emerald-500/40 text-emerald-300",
        status === "offline" && "border-red-500/40 text-red-300",
        status === "unknown" && "border-zinc-700 text-zinc-400",
      )}
    >
      <span className="relative size-2 shrink-0">
        {status === "online" ? (
          <span className="absolute inset-0 rounded-full bg-emerald-400/70 animate-ping" />
        ) : null}
        <span className={cn("absolute inset-[2px] rounded-full", hostStatusDotClass(status))} />
      </span>
      {status === "online" ? "Online" : status === "offline" ? "Offline" : "Unknown"}
    </Badge>
  );
}

export function HostActions({
  host,
  onClose,
  showCloseButton = true,
  onDeleted,
}: {
  host: Host;
  onClose: () => void;
  /** When false, the panel close button is hidden (e.g. full-page host detail). */
  showCloseButton?: boolean;
  /** Called after successful delete; defaults to `onClose`. */
  onDeleted?: () => void;
}) {
  const refreshMutation = useRefreshHost();
  const relocateMutation = useRelocateHost();
  const rebootMutation = useRebootHost();
  const deleteMutation = useDeleteHost();
  const afterDelete = onDeleted ?? onClose;

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={refreshMutation.isPending || !isReachableHost(host)}
            aria-label="Probe host"
            onClick={() => refreshMutation.mutate(host.id)}
          >
            <RefreshCw
              className={cn("size-3", refreshMutation.isPending && "animate-spin")}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Probe host
        </TooltipContent>
      </Tooltip>
      {host.mac_address ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={relocateMutation.isPending}
              aria-label="Relocate IP"
              onClick={() => relocateMutation.mutate(host.id)}
            >
              <Locate
                className={cn("size-3", relocateMutation.isPending && "animate-spin")}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Relocate IP
          </TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Reboot device"
            disabled={rebootMutation.isPending || !isReachableHost(host)}
            onClick={() => rebootMutation.mutate(host.id)}
          >
            <Power className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Reboot device
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            aria-label="Delete host"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (!window.confirm("Delete this host? This cannot be undone.")) return;
              deleteMutation.mutate(host.id, {
                onSuccess: () => afterDelete(),
              });
            }}
          >
            <Trash2 className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Delete host
        </TooltipContent>
      </Tooltip>
      {showCloseButton ? (
        <>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Close panel"
                onClick={onClose}
              >
                <X className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Close
            </TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </div>
  );
}

export function EditableNameSection({ host }: { host: Host }) {
  const [draft, setDraft] = useState(host.name ?? "");
  const updateMutation = useUpdateHost();
  const defaultSsh = useAppSshPort();

  return (
    <EditableSection
      title="Display name"
      onSave={async () => {
        await updateMutation.mutateAsync({
          id: host.id,
          payload: buildUpdatePayload(host, { name: draft.trim() || "" }, defaultSsh),
        });
        toast.success("Display name updated");
      }}
      onEditStart={() => setDraft(host.name ?? "")}
      onEditCancel={() => setDraft(host.name ?? "")}
      renderDisplay={() => (
        <p className="text-sm text-zinc-300">{host.name || "Not set"}</p>
      )}
      renderForm={({ saving }) => (
        <Input
          className="h-7 text-xs"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Optional display name"
          disabled={saving}
        />
      )}
    />
  );
}

export function EditableConnectionSection({ host }: { host: Host }) {
  const defaultSsh = useAppSshPort();
  const [draft, setDraft] = useState({
    ip_address: host.ip_address ?? "",
    ssh_user: host.ssh_user ?? "",
    ssh_port: host.ssh_port ?? defaultSsh,
  });
  const updateMutation = useUpdateHost();

  return (
    <div className="space-y-2">
      <EditableSection
        title="Connection"
        initialEditing={!host.ip_address || !host.ssh_user}
        onSave={async () => {
          await updateMutation.mutateAsync({
            id: host.id,
            payload: buildUpdatePayload(host, draft, defaultSsh),
          });
          toast.success("Connection updated");
        }}
        onEditStart={() =>
          setDraft({
            ip_address: host.ip_address ?? "",
            ssh_user: host.ssh_user ?? "",
            ssh_port: host.ssh_port ?? defaultSsh,
          })
        }
        onEditCancel={() =>
          setDraft({
            ip_address: host.ip_address ?? "",
            ssh_user: host.ssh_user ?? "",
            ssh_port: host.ssh_port ?? defaultSsh,
          })
        }
        renderDisplay={() => (
          <div className="space-y-0.5 text-xs text-zinc-300">
            <p>IP: {host.ip_address || "Not set"}</p>
            <p>User: {host.ssh_user || "Not set"}</p>
            <p>Port: {host.ssh_port}</p>
          </div>
        )}
        renderForm={({ saving }) => (
          <>
            <Input
              className="h-7 text-xs"
              value={draft.ip_address}
              onChange={(e) => setDraft((d) => ({ ...d, ip_address: e.target.value }))}
              placeholder="IP address"
              disabled={saving}
            />
            <div className="flex gap-2">
              <Input
                className="h-7 text-xs flex-1"
                value={draft.ssh_user}
                onChange={(e) => setDraft((d) => ({ ...d, ssh_user: e.target.value }))}
                placeholder="SSH user"
                disabled={saving}
              />
              <Input
                className="h-7 text-xs w-16"
                type="number"
                value={draft.ssh_port}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    ssh_port: Number(e.target.value) || defaultSsh,
                  }))
                }
                disabled={saving}
              />
            </div>
          </>
        )}
      />
      <p className="text-[10px] text-zinc-500">
        OS: {host.os_family ?? "Not discovered"} · MAC: {host.mac_address || "N/A"}
      </p>
    </div>
  );
}

export function EditableLabelsSection({ host }: { host: Host }) {
  const [draft, setDraft] = useState<string[]>(host.labels ?? []);
  const [newLabel, setNewLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const updateMutation = useUpdateHost();
  const defaultSsh = useAppSshPort();

  return (
    <EditableSection
      title="Labels"
      onSave={async () => {
        await updateMutation.mutateAsync({
          id: host.id,
          payload: buildUpdatePayload(host, { labels: draft }, defaultSsh),
        });
        toast.success("Labels updated");
      }}
      onEditStart={() => {
        setDraft(host.labels ?? []);
        setNewLabel("");
      }}
      onEditCancel={() => {
        setDraft(host.labels ?? []);
        setNewLabel("");
      }}
      renderDisplay={() => (
        <div className="flex flex-wrap gap-1 min-h-[20px]">
          {(host.labels ?? []).length > 0 ? (
            (host.labels ?? []).map((label) => (
              <Badge key={label} variant="outline" className="text-[10px]">
                {label}
              </Badge>
            ))
          ) : (
            <p className="text-[10px] text-zinc-600">No labels</p>
          )}
        </div>
      )}
      renderForm={({ saving }) => (
        <>
          <div className="flex flex-wrap gap-1 min-h-[20px]">
            {draft.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
              >
                {label}
                <button
                  type="button"
                  className="text-zinc-500 hover:text-zinc-200"
                  onClick={() => setDraft((d) => d.filter((l) => l !== label))}
                  disabled={saving}
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
            {draft.length === 0 && <p className="text-[10px] text-zinc-600">No labels</p>}
          </div>
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const val = newLabel.trim();
              if (val && !draft.includes(val)) setDraft((d) => [...d, val]);
              setNewLabel("");
              inputRef.current?.focus();
            }}
          >
            <Input
              ref={inputRef}
              className="h-7 text-xs flex-1"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Add label"
              disabled={saving}
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[10px]"
              disabled={!newLabel.trim() || saving}
            >
              <Plus className="size-2.5" />
            </Button>
          </form>
        </>
      )}
    />
  );
}

export function EditableGroupsSection({ host, allGroups }: { host: Host; allGroups: Group[] }) {
  const [draft, setDraft] = useState<string[]>(host.groups ?? []);
  const updateMutation = useUpdateHost();
  const defaultSsh = useAppSshPort();
  const availableGroups = useMemo(
    () => allGroups.filter((g) => !draft.includes(g.id)),
    [allGroups, draft],
  );

  return (
    <EditableSection
      title="Groups"
      onSave={async () => {
        await updateMutation.mutateAsync({
          id: host.id,
          payload: buildUpdatePayload(host, { groups: draft }, defaultSsh),
        });
        toast.success("Groups updated");
      }}
      onEditStart={() => setDraft(host.groups ?? [])}
      onEditCancel={() => setDraft(host.groups ?? [])}
      renderDisplay={() => (
        <div className="flex flex-wrap gap-1 min-h-[20px]">
          {(host.groups ?? []).length > 0 ? (
            (host.groups ?? []).map((gid) => {
              const g = allGroups.find((x) => x.id === gid);
              return (
                <Badge key={gid} variant="outline" className="text-[10px]">
                  {g?.name ?? gid}
                </Badge>
              );
            })
          ) : (
            <p className="text-[10px] text-zinc-600">No groups</p>
          )}
        </div>
      )}
      renderForm={({ saving }) => (
        <>
          <div className="flex flex-wrap gap-1 min-h-[20px]">
            {draft.map((gid) => {
              const g = allGroups.find((x) => x.id === gid);
              return (
                <span
                  key={gid}
                  className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
                >
                  {g?.name ?? gid}
                  <button
                    type="button"
                    className="text-zinc-500 hover:text-zinc-200"
                    onClick={() => setDraft((d) => d.filter((id) => id !== gid))}
                    disabled={saving}
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              );
            })}
            {draft.length === 0 && <p className="text-[10px] text-zinc-600">No groups</p>}
          </div>
          <Select
            value=""
            onValueChange={(value) => {
              if (value && !draft.includes(value)) setDraft((d) => [...d, value]);
            }}
          >
            <SelectTrigger size="sm" className="h-7 text-xs w-[160px]" disabled={saving}>
              <SelectValue placeholder="Add group" />
            </SelectTrigger>
            <SelectContent>
              {availableGroups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name || g.id}
                </SelectItem>
              ))}
              {availableGroups.length === 0 ? (
                <div className="px-2 py-4 text-xs text-zinc-500">No more groups</div>
              ) : null}
            </SelectContent>
          </Select>
        </>
      )}
    />
  );
}

/** Vars edited in UI; racksmith_* and ansible_* stay hidden (managed elsewhere). */
function partitionEditableHostVars(vars: Record<string, unknown>): {
  hidden: Record<string, unknown>;
  editable: Record<string, unknown>;
} {
  const hidden: Record<string, unknown> = {};
  const editable: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (k.startsWith("racksmith_") || k.startsWith("ansible_")) {
      hidden[k] = v;
    } else {
      editable[k] = v;
    }
  }
  return { hidden, editable };
}

export function EditableVarsSection({ host }: { host: Host }) {
  const [rows, setRows] = useState<VarRow[]>(() =>
    varsToRows(partitionEditableHostVars(host.vars ?? {}).editable),
  );
  const [dirty, setDirty] = useState(false);
  const updateMutation = useUpdateHost();
  const defaultSsh = useAppSshPort();

  const handleChange = (next: VarRow[]) => {
    setRows(next);
    setDirty(true);
  };

  const save = () => {
    const { hidden } = partitionEditableHostVars(host.vars ?? {});
    updateMutation.mutate(
      {
        id: host.id,
        payload: buildUpdatePayload(
          host,
          { vars: { ...hidden, ...rowsToVars(rows) } },
          defaultSsh,
        ),
      },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Variables saved");
        },
      },
    );
  };

  return (
    <div className="space-y-2">
      <KeyValueEditor
        rows={rows}
        onChange={handleChange}
        emptyMessage="No variables defined."
      />
      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" className="h-6 text-[10px]" onClick={save} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save variables"}
          </Button>
        </div>
      )}
    </div>
  );
}
