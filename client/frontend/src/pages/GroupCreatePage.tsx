import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CreatePageShell } from "@/components/shared/create-page-shell";
import { createGroup } from "@/lib/groups";

export function GroupCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Group name is required");
      return;
    }
    setSaving(true);
    try {
      const { group } = await createGroup({
        name: trimmedName,
        description: description.trim() || undefined,
      });
      toast.success("Group created");
      navigate(`/groups/${group.id}`, { replace: true });
    } catch (error) {
      toastApiError(error, "Failed to create group");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CreatePageShell
      title="Create group"
      description="Groups organize nodes for stack targeting."
    >
      <form onSubmit={handleSubmit} className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. production-servers"
            className="h-8"
            />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Description (optional)</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this group"
            className="min-h-20"
            />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Creating..." : "Create group"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => navigate("/groups")}
            >
              Cancel
            </Button>
        </div>
      </form>
    </CreatePageShell>
  );
}
