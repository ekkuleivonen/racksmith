import { useMemo, useState } from "react";
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
import type {
  RoleCatalogEntry,
  PlaybookRoleEntry,
  PlaybookUpsert,
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
  | { kind: "group_var"; group: string; key: string };

const WIRE_RE = /^\{\{\s*(\S+)\s*\}\}$/;

function parseWire(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = WIRE_RE.exec(value);
  return m ? m[1] : null;
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

function resolveWireSource(factKey: string, allVars: VarSource[]): string {
  const match = allVars.find((v) => v.key === factKey);
  if (!match) return "variable";
  if (match.kind === "output") return match.group;
  if (match.kind === "host_var") return "host var";
  return match.group.toLowerCase();
}

// ---------------------------------------------------------------------------
// WiredPill: read-only display of a {{ fact_key }} reference
// ---------------------------------------------------------------------------

function WiredPill({
  factKey,
  sourceName,
  compatible,
  onRewire,
  onClear,
}: {
  factKey: string;
  sourceName: string;
  compatible: VarSource[];
  onRewire: (factKey: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/60 px-2 py-1.5 text-xs">
      <Link2 className="size-3 shrink-0 text-zinc-500" />
      <span className="truncate text-zinc-400">{sourceName}</span>
      <span className="text-zinc-600">&rarr;</span>
      <span className="truncate font-mono text-zinc-300">{factKey}</span>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {compatible.length > 0 && (
          <VarPickerPopover vars={compatible} onSelect={onRewire}>
            <button
              type="button"
              className="text-zinc-500 hover:text-zinc-300"
              title="Change linked variable"
            >
              <Link2 className="size-3" />
            </button>
          </VarPickerPopover>
        )}
        <button
          type="button"
          onClick={onClear}
          className="text-zinc-500 hover:text-zinc-300"
          title="Unlink"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
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

  if (vars.length === 0) return null;

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
        {Array.from(grouped.entries()).map(([groupName, items]) => (
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
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// LinkButton: visible button that opens VarPickerPopover
// ---------------------------------------------------------------------------

function LinkButton({
  vars,
  onSelect,
}: {
  vars: VarSource[];
  onSelect: (key: string) => void;
}) {
  return (
    <VarPickerPopover vars={vars} onSelect={onSelect}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
      >
        <Link2 className="size-3.5" />
      </Button>
    </VarPickerPopover>
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

  const clearVar = (key: string) => {
    const next = { ...role.vars };
    delete next[key];
    updateRole(index, { ...role, vars: next });
  };

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
              const wiredFact = parseWire(rawValue);
              const matched = compatibleVars(allVars, field.type);

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

                  {wiredFact ? (
                    <WiredPill
                      factKey={wiredFact}
                      sourceName={resolveWireSource(wiredFact, allVars)}
                      compatible={matched}
                      onRewire={(fk) =>
                        setVar(field.key, `{{ ${fk} }}`)
                      }
                      onClear={() => clearVar(field.key)}
                    />
                  ) : (field.options?.length ?? 0) > 0 ? (
                    <div className="flex gap-1">
                      <Select
                        value={String(rawValue)}
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
                      {matched.length > 0 && !isSecret ? (
                        <LinkButton vars={matched} onSelect={(fk) => setVar(field.key, `{{ ${fk} }}`)} />
                      ) : null}
                    </div>
                  ) : field.type === "bool" || field.type === "boolean" ? (
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
                      {matched.length > 0 && !isSecret ? (
                        <LinkButton vars={matched} onSelect={(fk) => setVar(field.key, `{{ ${fk} }}`)} />
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <Input
                        className="min-w-0 flex-1"
                        value={String(rawValue)}
                        onChange={(event) =>
                          setVar(field.key, event.target.value)
                        }
                        placeholder={field.placeholder}
                        disabled={isSecret}
                      />
                      {matched.length > 0 && !isSecret ? (
                        <LinkButton vars={matched} onSelect={(fk) => setVar(field.key, `{{ ${fk} }}`)} />
                      ) : null}
                    </div>
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
}: PlaybookEditorFormProps) {
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
                      allVars={getAvailableVars(
                        draft.roles,
                        rolesById,
                        index,
                        hosts,
                        groups,
                      )}
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
