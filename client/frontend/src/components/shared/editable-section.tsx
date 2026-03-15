import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EditableSectionProps {
  title: string;
  onSave: () => Promise<void>;
  renderDisplay: () => React.ReactNode;
  renderForm: (props: { saving: boolean }) => React.ReactNode;
  onEditStart?: () => void;
  onEditCancel?: () => void;
  initialEditing?: boolean;
}

export function EditableSection({
  title,
  onSave,
  renderDisplay,
  renderForm,
  onEditStart,
  onEditCancel,
  initialEditing = false,
}: EditableSectionProps) {
  const [editing, setEditing] = useState(initialEditing);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    onEditCancel?.();
    setEditing(false);
  };

  const handleEdit = () => {
    onEditStart?.();
    setEditing(true);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
          {title}
        </p>
        {!editing && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 text-[10px] text-zinc-400 hover:text-zinc-200"
            onClick={handleEdit}
          >
            <Pencil className="size-2.5" />
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          {renderForm({ saving })}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-6 text-[10px]"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px]"
              disabled={saving}
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        renderDisplay()
      )}
    </div>
  );
}
