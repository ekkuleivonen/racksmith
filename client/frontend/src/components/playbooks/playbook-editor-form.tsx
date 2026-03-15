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
import { GripVertical, Trash2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  RoleCatalogEntry,
  PlaybookRoleEntry,
  PlaybookUpsert,
} from "@/lib/playbooks";

interface PlaybookEditorFormProps {
  draft: PlaybookUpsert;
  roles: RoleCatalogEntry[];
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

type SortableRoleCardProps = {
  roleId: string;
  role: PlaybookRoleEntry;
  index: number;
  roleEntry: RoleCatalogEntry;
  updateRole: (index: number, nextRole: PlaybookRoleEntry) => void;
  removeRole: (index: number) => void;
};

function SortableRoleCard({
  roleId,
  role,
  index,
  roleEntry,
  updateRole,
  removeRole,
}: SortableRoleCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: roleId,
    });

  return (
    <AccordionItem
      value={roleId}
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
        {roleEntry.inputs.filter(
          (f) => !(f as { interactive?: boolean }).interactive,
        ).length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {roleEntry.inputs
              .filter((f) => !(f as { interactive?: boolean }).interactive)
              .map((field) => (
                <div key={field.key} className="space-y-1">
                  <p className="text-xs text-zinc-400">
                    {field.label}
                    {field.required ? (
                      <span className="ml-1 text-red-400">*</span>
                    ) : null}
                  </p>
                  {(field.options?.length ?? 0) > 0 ? (
                    <Select
                      value={String(
                        role.vars[field.key] ?? field.default ?? "",
                      )}
                      onValueChange={(value) =>
                        updateRole(index, {
                          ...role,
                          vars: { ...role.vars, [field.key]: value },
                        })
                      }
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
                  ) : field.type === "bool" || field.type === "boolean" ? (
                    <Select
                      value={
                        String(
                          role.vars[field.key] !== undefined
                            ? role.vars[field.key] === true
                            : field.default === true,
                        )
                      }
                      onValueChange={(value) =>
                        updateRole(index, {
                          ...role,
                          vars: {
                            ...role.vars,
                            [field.key]: value === "true",
                          },
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={field.placeholder || "Select..."} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={String(
                        role.vars[field.key] ?? field.default ?? "",
                      )}
                      onChange={(event) =>
                        updateRole(index, {
                          ...role,
                          vars: {
                            ...role.vars,
                            [field.key]: event.target.value,
                          },
                        })
                      }
                      placeholder={field.placeholder}
                    />
                  )}
                </div>
              ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            No additional variables for this role.
          </p>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function PlaybookEditorForm({
  draft,
  roles,
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
  const [activeRoleId, setActiveRoleId] = useState<string | undefined>(
    undefined,
  );

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
    const addedRoleIds = new Set(draft.roles.map((r: PlaybookRoleEntry) => r.role_id));

    const withoutAlreadyAdded = rolesByLabel
      .map((group) => ({
        ...group,
        roles: group.roles.filter(
          (role) => !addedRoleIds.has(role.id),
        ),
      }))
      .filter((group) => group.roles.length > 0);

    if (!normalized) return withoutAlreadyAdded;

    return withoutAlreadyAdded
      .map((group) => ({
        ...group,
        roles: group.roles.filter((role) =>
          `${role.name} ${role.description} ${(role.labels ?? []).join(" ")}`
            .toLowerCase()
            .includes(normalized),
        ),
      }))
      .filter((group) => group.roles.length > 0);
  }, [rolesByLabel, roleQuery, draft.roles]);

  const safeActiveRoleId =
    activeRoleId &&
    draft.roles.some(
      (role: PlaybookRoleEntry) => role.role_id === activeRoleId,
    )
      ? activeRoleId
      : undefined;

  const updateRole = (index: number, nextRole: PlaybookRoleEntry) => {
    onChange({
      ...draft,
      roles: draft.roles.map((role: PlaybookRoleEntry, roleIndex: number) =>
        roleIndex === index ? nextRole : role,
      ),
    });
  };

  const removeRole = (index: number) => {
    const removedRole = draft.roles[index];
    onChange({
      ...draft,
      roles: draft.roles.filter((_: PlaybookRoleEntry, roleIndex: number) => roleIndex !== index),
    });
    if (removedRole?.role_id === activeRoleId) {
      const fallback = draft.roles.find((_: PlaybookRoleEntry, roleIndex: number) => roleIndex !== index);
      setActiveRoleId(fallback?.role_id);
    }
  };

  const addRole = (roleId: string) => {
    if (draft.roles.some((role: PlaybookRoleEntry) => role.role_id === roleId)) return;
    const roleEntry = rolesById[roleId];
    const initialVars = roleEntry ? defaultVarsForRole(roleEntry) : {};

    onChange({
      ...draft,
      roles: [...draft.roles, { role_id: roleId, vars: initialVars }],
    });
    setActiveRoleId(roleId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = draft.roles.findIndex(
      (role: PlaybookRoleEntry) => role.role_id === String(active.id),
    );
    const newIndex = draft.roles.findIndex(
      (role: PlaybookRoleEntry) => role.role_id === String(over.id),
    );
    if (oldIndex < 0 || newIndex < 0) return;

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
              items={draft.roles.map((role: PlaybookRoleEntry) => role.role_id)}
              strategy={verticalListSortingStrategy}
            >
              <Accordion
                type="single"
                collapsible
                value={safeActiveRoleId}
                onValueChange={(next) => setActiveRoleId(next || undefined)}
                className="space-y-3"
              >
                {draft.roles.map((role: PlaybookRoleEntry, index: number) => {
                  const roleEntry = rolesById[role.role_id];
                  if (!roleEntry) return null;
                  return (
                    <SortableRoleCard
                      key={role.role_id}
                      roleId={role.role_id}
                      role={role}
                      index={index}
                      roleEntry={roleEntry}
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
