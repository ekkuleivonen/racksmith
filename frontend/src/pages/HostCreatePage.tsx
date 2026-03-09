import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ItemHardwareFields } from "@/components/racks/item-hardware-fields";
import { createHost, refreshHost, type HostInput } from "@/lib/hosts";

const defaultForm: HostInput = {
  name: "",
  ip_address: "",
  ssh_user: "",
  ssh_port: 22,
  managed: true,
  groups: [],
  labels: [],
  notes: "",
};

export function HostCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<HostInput>(defaultForm);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const result = await createHost({
        ...form,
        name: form.name?.trim() ?? "",
      });
      try {
        await refreshHost(result.host.id);
      } catch {
        // Host created; probe failed (e.g. SSH not ready). User can rediscover later.
      }
      toast.success("Host created");
      navigate(`/hosts/${result.host.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create host");
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
          <h1 className="text-zinc-100 font-semibold">Add host</h1>
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
            {saving ? "Creating..." : "Create host"}
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
