import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { PlaybookRoleEntry, PlaybookUpsertRequest, RoleTemplate } from "@/lib/playbooks";

interface PlaybookEditorFormProps {
  draft: PlaybookUpsertRequest;
  roleTemplates: RoleTemplate[];
  submitLabel: string;
  submitting: boolean;
  onChange: (next: PlaybookUpsertRequest) => void;
  onSubmit: () => Promise<void>;
  onDelete?: () => Promise<void>;
  deleteLabel?: string;
  inlineTextFields?: boolean;
  compact?: boolean;
}

function roleTemplateMap(roleTemplates: RoleTemplate[]) {
  return Object.fromEntries(roleTemplates.map((template) => [template.id, template]));
}

type SortableRoleCardProps = {
  role: PlaybookRoleEntry;
  index: number;
  template: RoleTemplate;
  updateRole: (index: number, nextRole: PlaybookRoleEntry) => void;
  removeRole: (index: number) => void;
};

function SortableRoleCard({
  role,
  index,
  template,
  updateRole,
  removeRole,
}: SortableRoleCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: role.template_id,
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
            aria-label={`Reorder ${template.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <div className="space-y-1">
            <p className="text-sm text-zinc-100">{template.name}</p>
            <p className="text-xs text-zinc-500">{template.description}</p>
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

      {template.fields.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-2">
          {template.fields.map((field) => (
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
        <p className="text-xs text-zinc-500">No additional variables for this role.</p>
      )}
    </div>
  );
}

export function PlaybookEditorForm({
  draft,
  roleTemplates,
  submitLabel,
  submitting,
  onChange,
  onSubmit,
  onDelete,
  deleteLabel = "Delete",
  inlineTextFields = false,
  compact = false,
}: PlaybookEditorFormProps) {
  const templatesById = roleTemplateMap(roleTemplates);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [editingField, setEditingField] = useState<"play_name" | "description" | null>(null);
  const [roleSearch, setRoleSearch] = useState("");
  const playNameInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editingField === "play_name") {
      playNameInputRef.current?.focus();
      playNameInputRef.current?.select();
    }
    if (editingField === "description") {
      descriptionInputRef.current?.focus();
      descriptionInputRef.current?.select();
    }
  }, [editingField]);

  const updateRole = (index: number, nextRole: PlaybookRoleEntry) => {
    onChange({
      ...draft,
      roles: draft.roles.map((role, roleIndex) => (roleIndex === index ? nextRole : role)),
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

    const oldIndex = draft.roles.findIndex((role) => role.template_id === active.id);
    const newIndex = draft.roles.findIndex((role) => role.template_id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    onChange({
      ...draft,
      roles: arrayMove(draft.roles, oldIndex, newIndex),
    });
  };

  const filteredRoleTemplates = useMemo(() => {
    const normalized = roleSearch.trim().toLowerCase();
    if (!normalized) return roleTemplates;
    return roleTemplates.filter((template) =>
      `${template.name} ${template.description}`.toLowerCase().includes(normalized),
    );
  }, [roleSearch, roleTemplates]);

  return (
    <section className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
      {!compact ? (
        <div className="space-y-1">
          <p className="text-zinc-100 font-medium">Playbook</p>
          <p className="text-xs text-zinc-500">
            Racksmith generates native Ansible playbooks in `ansible_scripts/playbooks`.
          </p>
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="text-xs text-zinc-400">Play name</p>
        {inlineTextFields && editingField !== "play_name" ? (
          <button
            type="button"
            className="w-full border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-left text-sm text-zinc-100 hover:border-zinc-700"
            onDoubleClick={() => setEditingField("play_name")}
          >
            {draft.play_name || "Double-click to name this playbook"}
          </button>
        ) : (
          <Input
            ref={playNameInputRef}
            value={draft.play_name}
            onChange={(event) => onChange({ ...draft, play_name: event.target.value })}
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
            onChange={(event) => onChange({ ...draft, description: event.target.value })}
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
          onCheckedChange={(checked) => onChange({ ...draft, become: checked === true })}
        />
        Run with privilege escalation (`become: true`)
      </label>

      <Separator />

      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-zinc-100 font-medium">Role templates</p>
          {!compact ? (
            <p className="text-xs text-zinc-500">
              These are built-in automation blocks that Racksmith wires into the generated playbook.
            </p>
          ) : null}
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            value={roleSearch}
            onChange={(event) => setRoleSearch(event.target.value)}
            placeholder="Search roles by name or description"
            className="pl-7"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {filteredRoleTemplates.map((template) => (
            <Button
              key={template.id}
              type="button"
              size="sm"
              variant="outline"
              disabled={draft.roles.some((role) => role.template_id === template.id)}
              onClick={() =>
                onChange({
                  ...draft,
                  roles: [...draft.roles, { template_id: template.id, vars: {} }],
                })
              }
            >
              <Plus className="size-3.5" />
              {template.name}
            </Button>
          ))}
        </div>

        {filteredRoleTemplates.length === 0 ? (
          <p className="text-xs text-zinc-500">No roles match that search.</p>
        ) : null}

        {draft.roles.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Add at least one role template to make the playbook useful.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={draft.roles.map((role) => role.template_id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {draft.roles.map((role, index) => {
                  const template = templatesById[role.template_id];
                  if (!template) return null;
                  return (
                    <SortableRoleCard
                      key={role.template_id}
                      role={role}
                      index={index}
                      template={template}
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
          <Button size="sm" variant="outline" disabled={submitting} onClick={() => void onDelete()}>
            {deleteLabel}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
