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
import { GripVertical, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type {
  Action,
  StackRoleEntry,
  StackUpsertRequest,
} from "@/lib/stacks";

interface StackEditorFormProps {
  draft: StackUpsertRequest;
  actions: Action[];
  submitLabel: string;
  submitting: boolean;
  onChange: (next: StackUpsertRequest) => void;
  onSubmit: () => Promise<void>;
  onDelete?: () => Promise<void>;
  deleteLabel?: string;
  inlineTextFields?: boolean;
  compact?: boolean;
}

function actionMap(actions: Action[]) {
  return Object.fromEntries(actions.map((action) => [action.slug, action]));
}

type SortableRoleCardProps = {
  role: StackRoleEntry;
  index: number;
  action: Action;
  updateRole: (index: number, nextRole: StackRoleEntry) => void;
  removeRole: (index: number) => void;
};

function SortableRoleCard({
  role,
  index,
  action,
  updateRole,
  removeRole,
}: SortableRoleCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: `${role.action_slug}-${index}`,
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="space-y-2 border border-zinc-800 bg-zinc-950/40 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="mt-0.5 text-zinc-500 hover:text-zinc-100"
            aria-label={`Reorder ${action.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <div className="space-y-1">
            <p className="text-sm text-zinc-100">{action.name}</p>
            <p className="text-xs text-zinc-500">{action.description}</p>
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => removeRole(index)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {action.inputs.filter((f) => !(f as { interactive?: boolean }).interactive).length > 0 ? (
        <div className="grid gap-2 md:grid-cols-2">
          {action.inputs
            .filter((f) => !(f as { interactive?: boolean }).interactive)
            .map((field) => (
            <div key={field.key} className="space-y-1">
              <p className="text-xs text-zinc-400">{field.label}</p>
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
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          No additional variables for this role.
        </p>
      )}
    </div>
  );
}

export function StackEditorForm({
  draft,
  actions,
  submitLabel,
  submitting,
  onChange,
  onSubmit,
  onDelete,
  deleteLabel = "Delete",
  inlineTextFields = false,
  compact = false,
}: StackEditorFormProps) {
  const actionsById = actionMap(actions);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const [editingField, setEditingField] = useState<
    "name" | "description" | null
  >(null);
  const [roleSearch, setRoleSearch] = useState("");
  const [selectedLabelFilters, setSelectedLabelFilters] = useState<Set<string>>(
    new Set(),
  );

  const allLabels = useMemo(
    () =>
      Array.from(
        new Set(actions.flatMap((a) => a.labels ?? [])),
      ).sort(),
    [actions],
  );

  const toggleLabelFilter = (label: string) => {
    setSelectedLabelFilters((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };
  const playNameInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editingField === "name") {
      playNameInputRef.current?.focus();
      playNameInputRef.current?.select();
    }
    if (editingField === "description") {
      descriptionInputRef.current?.focus();
      descriptionInputRef.current?.select();
    }
  }, [editingField]);

  const updateRole = (index: number, nextRole: StackRoleEntry) => {
    onChange({
      ...draft,
      roles: draft.roles.map((role, roleIndex) =>
        roleIndex === index ? nextRole : role,
      ),
    });
  };

  const removeRole = (index: number) => {
    onChange({
      ...draft,
      roles: draft.roles.filter((_, roleIndex) => roleIndex !== index),
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = draft.roles.findIndex(
      (_, i) => `${draft.roles[i].action_slug}-${i}` === active.id,
    );
    const newIndex = draft.roles.findIndex(
      (_, i) => `${draft.roles[i].action_slug}-${i}` === over.id,
    );
    if (oldIndex < 0 || newIndex < 0) return;

    onChange({
      ...draft,
      roles: arrayMove(draft.roles, oldIndex, newIndex),
    });
  };

  const filteredActions = useMemo(() => {
    let result = actions;
    const normalized = roleSearch.trim().toLowerCase();
    if (normalized) {
      result = result.filter((action) =>
        `${action.name} ${action.description}`.toLowerCase().includes(normalized),
      );
    }
    if (selectedLabelFilters.size > 0) {
      result = result.filter((action) =>
        (action.labels ?? []).some((l) => selectedLabelFilters.has(l)),
      );
    }
    return result;
  }, [roleSearch, actions, selectedLabelFilters]);

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

      <div className="space-y-1">
        <p className="text-xs text-zinc-400">Name</p>
        {inlineTextFields && editingField !== "name" ? (
          <button
            type="button"
            className="w-full border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-left text-sm text-zinc-100 hover:border-zinc-700"
            onDoubleClick={() => setEditingField("name")}
          >
            {draft.name || "Double-click to name this stack"}
          </button>
        ) : (
          <Input
            ref={playNameInputRef}
            value={draft.name}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
            onBlur={() => {
              if (inlineTextFields) setEditingField(null);
            }}
            onKeyDown={(event) => {
              if (!inlineTextFields) return;
              if (event.key === "Enter") {
                event.preventDefault();
                setEditingField(null);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setEditingField(null);
              }
            }}
            placeholder="Get info"
          />
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs text-zinc-400">Description</p>
        {inlineTextFields && editingField !== "description" ? (
          <button
            type="button"
            className="w-full border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-left text-sm text-zinc-300 hover:border-zinc-700"
            onDoubleClick={() => setEditingField("description")}
          >
            {draft.description || "Double-click to add a description"}
          </button>
        ) : (
          <Textarea
            ref={descriptionInputRef}
            value={draft.description}
            onChange={(event) =>
              onChange({ ...draft, description: event.target.value })
            }
            onBlur={() => {
              if (inlineTextFields) setEditingField(null);
            }}
            onKeyDown={(event) => {
              if (!inlineTextFields) return;
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                setEditingField(null);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setEditingField(null);
              }
            }}
            placeholder="Short description shown in the UI."
            className="min-h-20"
          />
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <Checkbox
          checked={draft.become}
          onCheckedChange={(checked) =>
            onChange({ ...draft, become: checked === true })
          }
        />
        Run with privilege escalation (`become: true`)
      </label>

      <Separator />

      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-zinc-100 font-medium">Actions</p>
          {!compact ? (
            <p className="text-xs text-zinc-500">
              These are built-in automation blocks that Racksmith wires into the
              generated stack.
            </p>
          ) : null}
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            value={roleSearch}
            onChange={(event) => setRoleSearch(event.target.value)}
            placeholder="Search actions by name or description"
            className="pl-7"
          />
        </div>

        {allLabels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allLabels.map((label) => (
              <Badge
                key={label}
                variant={selectedLabelFilters.has(label) ? "default" : "outline"}
                className="cursor-pointer text-[10px]"
                onClick={() => toggleLabelFilter(label)}
              >
                {label}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {filteredActions.map((action) => (
            <Button
              key={action.slug}
              type="button"
              size="sm"
              variant="outline"
              disabled={draft.roles.some(
                (role) => role.action_slug === action.slug,
              )}
              onClick={() =>
                onChange({
                  ...draft,
                  roles: [
                    ...draft.roles,
                    { action_slug: action.slug, vars: {} },
                  ],
                })
              }
            >
              <Plus className="size-3.5" />
              {action.name}
            </Button>
          ))}
        </div>

        {filteredActions.length === 0 ? (
          <p className="text-xs text-zinc-500">No roles match that search.</p>
        ) : null}

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
              items={draft.roles.map((role, i) => `${role.action_slug}-${i}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {draft.roles.map((role, index) => {
                  const action = actionsById[role.action_slug];
                  if (!action) return null;
                  return (
                    <SortableRoleCard
                      key={`${role.action_slug}-${index}`}
                      role={role}
                      index={index}
                      action={action}
                      updateRole={updateRole}
                      removeRole={removeRole}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={submitting} onClick={() => void onSubmit()}>
          {submitLabel}
        </Button>
        {onDelete ? (
          <Button
            size="sm"
            variant="outline"
            disabled={submitting}
            onClick={() => void onDelete()}
          >
            {deleteLabel}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
