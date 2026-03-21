import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Info, Link2, Trash2, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { queryKeys } from "@/lib/queryClient";
import {
  getPlaybookAvailableVars,
  type AvailableVarEntry,
  type PlaybookRoleEntry,
  type PlaybookUpsert,
  type RoleCatalogEntry,
} from "@/lib/playbooks";
import type { Host } from "@/lib/hosts";
import type { Group } from "@/lib/groups";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PlaybookEditorFormProps {
  draft: PlaybookUpsert;
  roles: RoleCatalogEntry[];
  hosts?: Host[];
  groups?: Group[];
  onChange: (next: PlaybookUpsert) => void;
  compact?: boolean;
  /** When set, variable sources are loaded from the API (saved playbook). */
  savedPlaybookId?: string;
}

function roleMap(roles: RoleCatalogEntry[]) {
  return Object.fromEntries(roles.map((role) => [role.id, role]));
}

function makeRolePickerValue(role: RoleCatalogEntry) {
  return `${role.id}|||${role.name}|||${role.description}|||${(role.labels ?? []).join(" ")}`;
}

function parseRoleIdFromPickerValue(value: string) {
  return value.split("|||")[0] ?? "";
}

function defaultVarsForRole(role: RoleCatalogEntry): Record<string, unknown> {
  return Object.fromEntries(
    role.inputs
      .filter((input) => input.default !== undefined && input.default !== null)
      .map((input) => [input.key, input.default]),
  );
}

// ---------------------------------------------------------------------------
// Unified variable sources
// ---------------------------------------------------------------------------

type VarSource =
  | { kind: "output"; group: string; key: string; description: string; type: string }
  | { kind: "host_var"; group: "Host variables"; key: string }
  | { kind: "group_var"; group: string; key: string }
  | { kind: "role_default"; group: string; key: string };

type Segment =
  | { kind: "text"; value: string }
  | { kind: "var"; key: string };

const TOKEN_RE = /\{\{\s*(\S+)\s*\}\}/g;

function tokenize(value: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of value.matchAll(TOKEN_RE)) {
    if (m.index > last) segments.push({ kind: "text", value: value.slice(last, m.index) });
    segments.push({ kind: "var", key: m[1] });
    last = m.index + m[0].length;
  }
  if (last < value.length) segments.push({ kind: "text", value: value.slice(last) });
  return segments;
}

function hasVarTokens(value: string): boolean {
  return /\{\{\s*\S+\s*\}\}/.test(value);
}

function normalizeType(t?: string): string {
  if (!t) return "string";
  if (t === "str") return "string";
  if (t === "bool" || t === "boolean") return "boolean";
  if (t === "secret") return "string";
  return t;
}

function getAvailableVars(
  draftRoles: PlaybookRoleEntry[],
  rolesById: Record<string, RoleCatalogEntry>,
  currentIndex: number,
  hosts: Host[],
  groups: Group[],
): VarSource[] {
  const result: VarSource[] = [];

  for (let i = 0; i < currentIndex; i++) {
    const entry = rolesById[draftRoles[i].role_id];
    if (!entry?.outputs) continue;
    for (const out of entry.outputs) {
      result.push({
        kind: "output",
        group: entry.name,
        key: out.key,
        description: out.description,
        type: out.type ?? "string",
      });
    }
  }

  const hostKeys = new Set<string>();
  for (const h of hosts) {
    for (const k of Object.keys(h.vars ?? {})) hostKeys.add(k);
  }
  for (const k of Array.from(hostKeys).sort()) {
    result.push({ kind: "host_var", group: "Host variables", key: k });
  }

  for (const g of groups) {
    const keys = Object.keys(g.vars ?? {});
    if (keys.length === 0) continue;
    const label = `Group: ${g.name ?? g.id}`;
    for (const k of keys.sort()) {
      result.push({ kind: "group_var", group: label, key: k });
    }
  }

  return result;
}

function entriesToVarSources(
  entries: AvailableVarEntry[],
  currentIndex: number,
): VarSource[] {
  const result: VarSource[] = [];
  for (const e of entries) {
    if (
      (e.source === "role_output" || e.source === "role_default") &&
      e.role_order !== null &&
      e.role_order >= currentIndex
    ) {
      continue;
    }
    if (e.source === "role_output") {
      result.push({
        kind: "output",
        group: e.from,
        key: e.key,
        description: e.description ?? "",
        type: e.output_type ?? "string",
      });
    } else if (e.source === "host_var") {
      result.push({ kind: "host_var", group: "Host variables", key: e.key });
    } else if (e.source === "group_var") {
      result.push({ kind: "group_var", group: e.from, key: e.key });
    } else if (e.source === "role_default") {
      result.push({
        kind: "role_default",
        group: `Defaults: ${e.from}`,
        key: e.key,
      });
    }
  }
  return result;
}

function compatibleVars(
  allVars: VarSource[],
  inputType?: string,
): VarSource[] {
  const norm = normalizeType(inputType);
  return allVars.filter((v) => {
    if (v.kind === "output") return normalizeType(v.type) === norm;
    return true;
  });
}

// ---------------------------------------------------------------------------
// VarPickerPopover: unified dropdown for outputs, host vars, group vars
// ---------------------------------------------------------------------------

function VarPickerPopover({
  vars,
  onSelect,
  children,
}: {
  vars: VarSource[];
  onSelect: (key: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const grouped = new Map<string, VarSource[]>();
  for (const v of vars) {
    const list = grouped.get(v.group) ?? [];
    list.push(v);
    grouped.set(v.group, list);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-72 w-72 overflow-y-auto p-1"
      >
        {vars.length === 0 ? (
          <p className="px-2 py-3 text-xs text-zinc-500">
            No variables available. Add host variables, group variables, or
            upstream role outputs to link here.
          </p>
        ) : (
          Array.from(grouped.entries()).map(([groupName, items]) => (
            <div key={groupName}>
              <p className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
                {groupName}
              </p>
              {items.map((v) => (
                <button
                  key={`${v.kind}-${v.key}`}
                  type="button"
                  className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-800"
                  onClick={() => {
                    onSelect(v.key);
                    setOpen(false);
                  }}
                >
                  <code className="shrink-0 font-mono text-zinc-300">
                    {v.key}
                  </code>
                  {v.kind === "output" && v.description ? (
                    <span className="truncate text-zinc-500">
                      {v.description}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// TokenInput: inline pill display + raw edit mode
// ---------------------------------------------------------------------------

function TokenInput({
  value,
  onChange,
  placeholder,
  disabled,
  vars,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  vars: VarSource[];
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setEditValue(value);
    setEditing(true);
  };

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  const commitEdit = () => {
    setEditing(false);
    if (editValue !== value) onChange(editValue);
  };

  const appendVar = (key: string) => {
    const next = value ? `${value}{{ ${key} }}` : `{{ ${key} }}`;
    onChange(next);
  };

  const resolveSource = (key: string): string => {
    const match = vars.find((v) => v.key === key);
    if (!match) return "variable";
    if (match.kind === "output") return `Output from ${match.group}`;
    if (match.kind === "host_var") return "Host variable";
    return match.group;
  };

  const replaceToken = (tokenIndex: number, newKey: string) => {
    const segs = tokenize(value);
    const rebuilt = segs
      .map((s, i) =>
        i === tokenIndex ? `{{ ${newKey} }}` : s.kind === "var" ? `{{ ${s.key} }}` : s.value,
      )
      .join("");
    onChange(rebuilt);
  };

  const removeToken = (tokenIndex: number) => {
    const segs = tokenize(value);
    const rebuilt = segs
      .filter((_, i) => i !== tokenIndex)
      .map((s) => (s.kind === "var" ? `{{ ${s.key} }}` : s.value))
      .join("");
    onChange(rebuilt);
  };

  if (editing) {
    return (
      <div className="flex gap-1">
        <Input
          ref={inputRef}
          className="min-w-0 flex-1 font-mono text-xs"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              commitEdit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
    );
  }

  const segments = tokenize(String(value));
  const hasTokens = segments.some((s) => s.kind === "var");
  const isEmpty = !value;

  return (
    <div className="flex gap-1">
      <div
        className="flex min-h-9 min-w-0 flex-1 cursor-text flex-wrap items-center gap-1 border border-zinc-800 bg-transparent px-3 py-1.5 text-sm"
        onClick={() => {
          if (!disabled) startEditing();
        }}
      >
        {isEmpty ? (
          <span className="text-zinc-500">{placeholder}</span>
        ) : hasTokens ? (
          segments.map((seg, i) =>
            seg.kind === "text" ? (
              <span key={i} className="text-zinc-300 break-all">
                {seg.value}
              </span>
            ) : (
              <Tooltip key={i}>
                <VarPickerPopover
                  vars={vars}
                  onSelect={(key) => replaceToken(i, key)}
                >
                  <TooltipTrigger asChild>
                    <span
                      role="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-0.5 bg-violet-500/15 px-1.5 py-0.5 font-mono text-[11px] text-violet-300 hover:bg-violet-500/25 transition-colors"
                    >
                      <Link2 className="size-2.5 shrink-0 opacity-60" />
                      {seg.key}
                      <button
                        type="button"
                        className="ml-0.5 opacity-50 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeToken(i);
                        }}
                      >
                        <X className="size-2.5" />
                      </button>
                    </span>
                  </TooltipTrigger>
                </VarPickerPopover>
                <TooltipContent side="top" className="text-xs">
                  {resolveSource(seg.key)}
                </TooltipContent>
              </Tooltip>
            ),
          )
        ) : (
          <span className="text-zinc-300 break-all">{String(value)}</span>
        )}
      </div>
      {!disabled && (
        <VarPickerPopover vars={vars} onSelect={appendVar}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
          >
            <Link2 className="size-3.5" />
          </Button>
        </VarPickerPopover>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableRoleCard
// ---------------------------------------------------------------------------

type SortableRoleCardProps = {
  instanceKey: string;
  role: PlaybookRoleEntry;
  index: number;
  roleEntry: RoleCatalogEntry;
  allVars: VarSource[];
  updateRole: (index: number, nextRole: PlaybookRoleEntry) => void;
  removeRole: (index: number) => void;
};

function SortableRoleCard({
  instanceKey,
  role,
  index,
  roleEntry,
  allVars,
  updateRole,
  removeRole,
}: SortableRoleCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: instanceKey,
    });

  const setVar = (key: string, value: unknown) =>
    updateRole(index, {
      ...role,
      vars: { ...role.vars, [key]: value },
    });

  return (
    <AccordionItem
      value={instanceKey}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="border border-zinc-800 bg-zinc-950/40"
    >
      <div className="flex items-center gap-2 px-3">
        <button
          type="button"
          className="shrink-0 text-zinc-500 hover:text-zinc-100"
          aria-label={`Reorder ${roleEntry.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1 [&>*]:w-full">
          <AccordionTrigger className="w-full items-center py-2.5 text-left hover:no-underline">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm text-zinc-100">{roleEntry.name}</p>
              <p className="truncate text-xs text-zinc-500">
                {roleEntry.description}
              </p>
            </div>
          </AccordionTrigger>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={() => removeRole(index)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <AccordionContent className="px-3 pb-3">
        {roleEntry.inputs.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {roleEntry.inputs.map((field) => {
              const isSecret = !!field.secret;
              const rawValue = role.vars[field.key] ?? field.default ?? "";
              const matched = compatibleVars(allVars, field.type);
              const wire = (fk: string) => setVar(field.key, `{{ ${fk} }}`);
              const rawStr = String(rawValue);
              const isWired = hasVarTokens(rawStr);

              const isBool = field.type === "bool" || field.type === "boolean";
              const hasOptions = (field.options?.length ?? 0) > 0;
              const isSelectField = (hasOptions || isBool) && !isWired;

              const fieldNode = (
                <div
                  key={field.key}
                  className={`space-y-1${isSecret ? " cursor-default opacity-50" : ""}`}
                >
                  <p className="flex items-center gap-1 text-xs text-zinc-400">
                    {field.label}
                    {field.required ? (
                      <span className="text-red-400">*</span>
                    ) : null}
                    {field.description ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="size-3 shrink-0 text-zinc-600 hover:text-zinc-400" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-64">
                          {field.description}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </p>

                  {isSelectField ? (
                    hasOptions ? (
                      <div className="flex gap-1">
                        <Select
                          value={rawStr}
                          onValueChange={(value) => setVar(field.key, value)}
                          disabled={isSecret}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={field.placeholder} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options!.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!isSecret && (
                          <VarPickerPopover vars={matched} onSelect={wire}>
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                              <Link2 className="size-3.5" />
                            </Button>
                          </VarPickerPopover>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Select
                          value={
                            String(
                              role.vars[field.key] !== undefined
                                ? role.vars[field.key] === true
                                : field.default === true,
                            )
                          }
                          onValueChange={(value) =>
                            setVar(field.key, value === "true")
                          }
                          disabled={isSecret}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={field.placeholder || "Select..."}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">true</SelectItem>
                            <SelectItem value="false">false</SelectItem>
                          </SelectContent>
                        </Select>
                        {!isSecret && (
                          <VarPickerPopover vars={matched} onSelect={wire}>
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                              <Link2 className="size-3.5" />
                            </Button>
                          </VarPickerPopover>
                        )}
                      </div>
                    )
                  ) : (
                    <TokenInput
                      value={rawStr}
                      onChange={(v) => setVar(field.key, v)}
                      placeholder={field.placeholder}
                      disabled={isSecret}
                      vars={matched}
                    />
                  )}
                </div>
              );

              if (!isSecret) return fieldNode;
              return (
                <Tooltip key={field.key}>
                  <TooltipTrigger asChild>
                    {fieldNode}
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    This value is prompted when the playbook runs
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            No additional variables for this role.
          </p>
        )}
        {(roleEntry.outputs?.length ?? 0) > 0 ? (
          <div className="mt-3 border-t border-zinc-800 pt-3">
            <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
              Outputs
            </p>
            <div className="flex flex-wrap gap-1.5">
              {roleEntry.outputs!.map((out) => (
                <Tooltip key={out.key}>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {out.key}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {out.description || out.key}
                    {out.type ? ` (${out.type})` : ""}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        ) : null}
      </AccordionContent>
    </AccordionItem>
  );
}

// ---------------------------------------------------------------------------
// PlaybookEditorForm
// ---------------------------------------------------------------------------

export function PlaybookEditorForm({
  draft,
  roles,
  hosts = [],
  groups = [],
  onChange,
  compact = false,
  savedPlaybookId,
}: PlaybookEditorFormProps) {
  const { data: apiVarEntries = [] } = useQuery({
    queryKey: [...queryKeys.playbooks, savedPlaybookId, "available-vars"],
    queryFn: async () =>
      (await getPlaybookAvailableVars(savedPlaybookId!)).vars,
    enabled: !!savedPlaybookId,
  });

  const rolesById = roleMap(roles);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const rolePickerAnchor = useComboboxAnchor();
  const [rolePickerValue, setRolePickerValue] = useState<string | null>(null);
  const [roleQuery, setRoleQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | undefined>(undefined);

  const [instanceKeys, setInstanceKeys] = useState<string[]>([]);
  if (instanceKeys.length !== draft.roles.length) {
    const next = [...instanceKeys];
    while (next.length < draft.roles.length) next.push(crypto.randomUUID());
    next.length = draft.roles.length;
    setInstanceKeys(next);
  }

  const rolePickerValueById = useMemo(
    () =>
      Object.fromEntries(
        roles.map((role) => [role.id, makeRolePickerValue(role)]),
      ),
    [roles],
  );

  const rolePickerItems = useMemo(
    () => Object.values(rolePickerValueById),
    [rolePickerValueById],
  );

  const rolesByLabel = useMemo(() => {
    const grouped = new Map<string, RoleCatalogEntry[]>();
    for (const role of roles) {
      const label =
        [...(role.labels ?? [])].sort((a, b) => a.localeCompare(b))[0] ??
        "other";
      const existing = grouped.get(label) ?? [];
      grouped.set(label, [...existing, role]);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groupedRoles]) => ({
        label,
        roles: [...groupedRoles].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [roles]);

  const filteredRolesByLabel = useMemo(() => {
    const normalized = roleQuery.trim().toLowerCase();
    if (!normalized) return rolesByLabel;

    return rolesByLabel
      .map((group) => ({
        ...group,
        roles: group.roles.filter((role) =>
          `${role.name} ${role.description} ${(role.labels ?? []).join(" ")}`
            .toLowerCase()
            .includes(normalized),
        ),
      }))
      .filter((group) => group.roles.length > 0);
  }, [rolesByLabel, roleQuery]);

  const safeActiveKey =
    activeKey && instanceKeys.includes(activeKey) ? activeKey : undefined;

  const updateRole = (index: number, nextRole: PlaybookRoleEntry) => {
    onChange({
      ...draft,
      roles: draft.roles.map((role: PlaybookRoleEntry, roleIndex: number) =>
        roleIndex === index ? nextRole : role,
      ),
    });
  };

  const removeRole = (index: number) => {
    const removedKey = instanceKeys[index];
    const nextKeys = instanceKeys.filter((_, i) => i !== index);
    setInstanceKeys(nextKeys);
    onChange({
      ...draft,
      roles: draft.roles.filter((_: PlaybookRoleEntry, roleIndex: number) => roleIndex !== index),
    });
    if (removedKey === activeKey) {
      setActiveKey(nextKeys[0]);
    }
  };

  const addRole = (roleId: string) => {
    const roleEntry = rolesById[roleId];
    const initialVars = roleEntry ? defaultVarsForRole(roleEntry) : {};
    const newKey = crypto.randomUUID();
    setInstanceKeys([...instanceKeys, newKey]);

    onChange({
      ...draft,
      roles: [...draft.roles, { role_id: roleId, vars: initialVars }],
    });
    setActiveKey(newKey);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = instanceKeys.indexOf(String(active.id));
    const newIndex = instanceKeys.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    setInstanceKeys(arrayMove(instanceKeys, oldIndex, newIndex));
    onChange({
      ...draft,
      roles: arrayMove(draft.roles, oldIndex, newIndex),
    });
  };

  return (
    <section className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
      {!compact ? (
        <div className="space-y-1">
          <p className="text-zinc-100 font-medium">Playbook</p>
          <p className="text-xs text-zinc-500">
            Racksmith generates native Ansible playbooks from
            `.racksmith/playbooks`.
          </p>
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-xs text-zinc-400">
        <Checkbox
          checked={draft.become ?? false}
          onCheckedChange={(checked) =>
            onChange({ ...draft, become: checked === true })
          }
        />
        Requires privilege escalation (sudo)
      </label>

      <div className="space-y-3">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-zinc-100 font-medium">
            Roles
            <Badge variant="outline" className="text-[10px]">
              {draft.roles.length}
            </Badge>
          </p>
          {!compact ? (
            <p className="text-xs text-zinc-500">
              These are built-in automation blocks that Racksmith wires into the
              generated playbook.
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <p className="text-xs text-zinc-400">Add role</p>
          <div ref={rolePickerAnchor} className="w-full">
            <Combobox
              value={rolePickerValue ?? undefined}
              onValueChange={(value) => {
                if (!value) {
                  setRolePickerValue(null);
                  return;
                }

                const parsedRoleId = parseRoleIdFromPickerValue(value);
                addRole(parsedRoleId);
                setRolePickerValue(null);
                setRoleQuery("");
              }}
              items={rolePickerItems}
              itemToStringLabel={(value) => {
                if (!value) return "";
                const parts = String(value).split("|||");
                return parts[1] || parts[0];
              }}
            >
              <ComboboxInput
                className="w-full"
                placeholder="Search and add roles..."
                showClear={!!rolePickerValue}
                onChange={(event) =>
                  setRoleQuery((event.target as HTMLInputElement).value)
                }
              />
              <ComboboxContent anchor={rolePickerAnchor}>
                <ComboboxList>
                  {filteredRolesByLabel.map((group) => (
                    <ComboboxGroup
                      key={group.label}
                      className="border-zinc-800/70 border-t pt-1 first:border-t-0 first:pt-0"
                    >
                      <ComboboxLabel className="px-2 py-1 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
                        Label: {group.label}
                      </ComboboxLabel>
                      {group.roles.map((role) => {
                        return (
                          <ComboboxItem
                            key={`${group.label}-${role.id}`}
                            value={rolePickerValueById[role.id]}
                            className="pl-4"
                          >
                            <div className="flex w-full items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-zinc-100">
                                  {role.name}
                                </p>
                                <p className="truncate text-[11px] text-zinc-500">
                                  {role.description}
                                </p>
                              </div>
                            </div>
                          </ComboboxItem>
                        );
                      })}
                    </ComboboxGroup>
                  ))}
                  <ComboboxEmpty>No roles found</ComboboxEmpty>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        </div>

        {draft.roles.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Add at least one role to make the playbook useful.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={instanceKeys}
              strategy={verticalListSortingStrategy}
            >
              <Accordion
                type="single"
                collapsible
                value={safeActiveKey}
                onValueChange={(next) => setActiveKey(next || undefined)}
                className="space-y-3"
              >
                {draft.roles.map((role: PlaybookRoleEntry, index: number) => {
                  const roleEntry = rolesById[role.role_id];
                  if (!roleEntry) return null;
                  return (
                    <SortableRoleCard
                      key={instanceKeys[index]}
                      instanceKey={instanceKeys[index]}
                      role={role}
                      index={index}
                      roleEntry={roleEntry}
                      allVars={
                        savedPlaybookId
                          ? entriesToVarSources(apiVarEntries, index)
                          : getAvailableVars(
                              draft.roles,
                              rolesById,
                              index,
                              hosts,
                              groups,
                            )
                      }
                      updateRole={updateRole}
                      removeRole={removeRole}
                    />
                  );
                })}
              </Accordion>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </section>
  );
}
