import { useEffect, useMemo, useState } from "react";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Action,
  StackRoleEntry,
  StackUpsertRequest,
} from "@/lib/stacks";

interface StackEditorFormProps {
  draft: StackUpsertRequest;
  actions: Action[];
  onChange: (next: StackUpsertRequest) => void;
  compact?: boolean;
}

function actionMap(actions: Action[]) {
  return Object.fromEntries(actions.map((action) => [action.slug, action]));
}

function makeActionPickerValue(action: Action) {
  return `${action.slug}|||${action.name}|||${action.description}|||${(action.labels ?? []).join(" ")}`;
}

function parseActionSlugFromPickerValue(value: string) {
  return value.split("|||")[0] ?? "";
}

type SortableRoleCardProps = {
  roleId: string;
  role: StackRoleEntry;
  index: number;
  action: Action;
  updateRole: (index: number, nextRole: StackRoleEntry) => void;
  removeRole: (index: number) => void;
};

function SortableRoleCard({
  roleId,
  role,
  index,
  action,
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
          aria-label={`Reorder ${action.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1 [&>*]:w-full">
          <AccordionTrigger
            className="w-full items-center py-2.5 text-left hover:no-underline"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm text-zinc-100">{action.name}</p>
              <p className="truncate text-xs text-zinc-500">{action.description}</p>
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
        {action.inputs.filter((f) => !(f as { interactive?: boolean }).interactive)
          .length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {action.inputs
              .filter((f) => !(f as { interactive?: boolean }).interactive)
              .map((field) => (
                <div key={field.key} className="space-y-1">
                  <p className="text-xs text-zinc-400">{field.label}</p>
                  {field.type === "select" && (field.options?.length ?? 0) > 0 ? (
                    <Select
                      value={String(role.vars[field.key] ?? field.default ?? "")}
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
                  ) : field.type === "boolean" ? (
                    <Checkbox
                      checked={
                        role.vars[field.key] !== undefined
                          ? Boolean(role.vars[field.key])
                          : field.default === true
                      }
                      onCheckedChange={(checked) =>
                        updateRole(index, {
                          ...role,
                          vars: {
                            ...role.vars,
                            [field.key]: checked === true,
                          },
                        })
                      }
                    />
                  ) : (
                    <Input
                      value={String(role.vars[field.key] ?? field.default ?? "")}
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

export function StackEditorForm({
  draft,
  actions,
  onChange,
  compact = false,
}: StackEditorFormProps) {
  const actionsById = actionMap(actions);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const actionPickerAnchor = useComboboxAnchor();
  const [actionPickerValue, setActionPickerValue] = useState<string | null>(
    null,
  );
  const [actionQuery, setActionQuery] = useState("");
  const [activeRoleId, setActiveRoleId] = useState<string | undefined>(
    undefined,
  );

  const actionPickerValueBySlug = useMemo(
    () =>
      Object.fromEntries(
        actions.map((action) => [action.slug, makeActionPickerValue(action)]),
      ),
    [actions],
  );

  const actionPickerItems = useMemo(
    () => Object.values(actionPickerValueBySlug),
    [actionPickerValueBySlug],
  );

  const actionsByLabel = useMemo(() => {
    const grouped = new Map<string, Action[]>();
    for (const action of actions) {
      // Keep each action in one deterministic group to avoid duplicates.
      const label =
        [...(action.labels ?? [])].sort((a, b) => a.localeCompare(b))[0] ??
        "other";
      const existing = grouped.get(label) ?? [];
      grouped.set(label, [...existing, action]);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groupedActions]) => ({
        label,
        actions: [...groupedActions].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [actions]);

  const filteredActionsByLabel = useMemo(() => {
    const normalized = actionQuery.trim().toLowerCase();
    const availableActionSlugSet = new Set(
      draft.roles.map((role) => role.action_slug),
    );

    const withoutAlreadyAdded = actionsByLabel
      .map((group) => ({
        ...group,
        actions: group.actions.filter(
          (action) => !availableActionSlugSet.has(action.slug),
        ),
      }))
      .filter((group) => group.actions.length > 0);

    if (!normalized) return withoutAlreadyAdded;

    return withoutAlreadyAdded
      .map((group) => ({
        ...group,
        actions: group.actions.filter((action) =>
          `${action.name} ${action.description} ${(action.labels ?? []).join(" ")}`
            .toLowerCase()
            .includes(normalized),
        ),
      }))
      .filter((group) => group.actions.length > 0);
  }, [actionsByLabel, actionQuery, draft.roles]);

  useEffect(() => {
    if (!activeRoleId) return;
    if (!draft.roles.some((role) => role.action_slug === activeRoleId)) {
      setActiveRoleId(draft.roles[0]?.action_slug);
    }
  }, [draft.roles, activeRoleId]);

  const updateRole = (index: number, nextRole: StackRoleEntry) => {
    onChange({
      ...draft,
      roles: draft.roles.map((role, roleIndex) =>
        roleIndex === index ? nextRole : role,
      ),
    });
  };

  const removeRole = (index: number) => {
    const removedRole = draft.roles[index];
    onChange({
      ...draft,
      roles: draft.roles.filter((_, roleIndex) => roleIndex !== index),
    });
    if (removedRole?.action_slug === activeRoleId) {
      const fallback = draft.roles.find((_, roleIndex) => roleIndex !== index);
      setActiveRoleId(fallback?.action_slug);
    }
  };

  const addRole = (actionSlug: string) => {
    if (draft.roles.some((role) => role.action_slug === actionSlug)) return;

    onChange({
      ...draft,
      roles: [...draft.roles, { action_slug: actionSlug, vars: {} }],
    });
    setActiveRoleId(actionSlug);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = draft.roles.findIndex(
      (role) => role.action_slug === String(active.id),
    );
    const newIndex = draft.roles.findIndex(
      (role) => role.action_slug === String(over.id),
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
          <p className="text-zinc-100 font-medium">Stack</p>
          <p className="text-xs text-zinc-500">
            Racksmith generates native Ansible playbooks from
            `.racksmith/stacks`.
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-zinc-100 font-medium">
            Actions
            <Badge variant="outline" className="text-[10px]">
              {draft.roles.length}
            </Badge>
          </p>
          {!compact ? (
            <p className="text-xs text-zinc-500">
              These are built-in automation blocks that Racksmith wires into the
              generated stack.
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <p className="text-xs text-zinc-400">Add action</p>
          <div ref={actionPickerAnchor} className="w-full">
            <Combobox
              value={actionPickerValue ?? undefined}
              onValueChange={(value) => {
                if (!value) {
                  setActionPickerValue(null);
                  return;
                }

                const actionSlug = parseActionSlugFromPickerValue(value);
                addRole(actionSlug);
                setActionPickerValue(null);
                setActionQuery("");
              }}
              items={actionPickerItems}
            >
              <ComboboxInput
                className="w-full"
                placeholder="Search and add actions..."
                showClear={!!actionPickerValue}
                onChange={(event) =>
                  setActionQuery((event.target as HTMLInputElement).value)
                }
              />
              <ComboboxContent anchor={actionPickerAnchor}>
                <ComboboxList>
                  {filteredActionsByLabel.map((group) => (
                    <ComboboxGroup
                      key={group.label}
                      className="border-zinc-800/70 border-t pt-1 first:border-t-0 first:pt-0"
                    >
                      <ComboboxLabel className="px-2 py-1 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
                        Label: {group.label}
                      </ComboboxLabel>
                      {group.actions.map((action) => {
                        return (
                          <ComboboxItem
                            key={`${group.label}-${action.slug}`}
                            value={actionPickerValueBySlug[action.slug]}
                            className="pl-4"
                          >
                            <div className="flex w-full items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-zinc-100">
                                  {action.name}
                                </p>
                                <p className="truncate text-[11px] text-zinc-500">
                                  {action.description}
                                </p>
                              </div>
                            </div>
                          </ComboboxItem>
                        );
                      })}
                    </ComboboxGroup>
                  ))}
                  <ComboboxEmpty>No actions found</ComboboxEmpty>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        </div>

        {draft.roles.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Add at least one action to make the stack useful.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={draft.roles.map((role) => role.action_slug)}
              strategy={verticalListSortingStrategy}
            >
              <Accordion
                type="single"
                collapsible
                value={activeRoleId}
                onValueChange={(next) => setActiveRoleId(next || undefined)}
                className="space-y-3"
              >
                {draft.roles.map((role, index) => {
                  const action = actionsById[role.action_slug];
                  if (!action) return null;
                  return (
                    <SortableRoleCard
                      key={role.action_slug}
                      roleId={role.action_slug}
                      role={role}
                      index={index}
                      action={action}
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
