import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ItemHardwareFields } from "@/components/racks/item-hardware-fields";
import { createNode, refreshNode, type NodeInput } from "@/lib/nodes";

const defaultForm: NodeInput = {
  name: "",
  ip_address: "",
  ssh_user: "",
  ssh_port: 22,
  managed: true,
  groups: [],
  labels: [],
  notes: "",
};

export function NodeCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<NodeInput>(defaultForm);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const result = await createNode({
        ...form,
        name: form.name?.trim() ?? "",
      });
      try {
        await refreshNode(result.node.id);
      } catch {
        // Node created; probe failed (e.g. SSH not ready). User can rediscover later.
      }
      toast.success("Node created");
      navigate(`/nodes/${result.node.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create node");
    } finally {
      setSaving(false);
    }
  };

  const itemLike = {
    managed: form.managed ?? true,
    name: form.name ?? "",
    ip_address: form.ip_address ?? "",
    ssh_user: form.ssh_user ?? "",
    ssh_port: form.ssh_port ?? 22,
    labels: form.labels ?? [],
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-xl mx-auto space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="space-y-1">
          <h1 className="text-zinc-100 font-semibold">Add node</h1>
          <p className="text-xs text-zinc-500">
            Add a hardware machine. You can configure SSH and placement later.
          </p>
        </div>

        <ItemHardwareFields
          item={itemLike}
          onChange={(patch) =>
            setForm((prev) => ({
              ...prev,
              ...patch,
            }))
          }
        />

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? "Creating..." : "Create node"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
