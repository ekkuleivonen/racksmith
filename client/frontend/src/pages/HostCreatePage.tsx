import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";
import { CreatePageShell } from "@/components/shared/create-page-shell";
import { Button } from "@/components/ui/button";
import { ItemHardwareFields } from "@/components/racks/item-hardware-fields";
import { useDefaults } from "@/hooks/queries";
import { SSH_PORT_FALLBACK } from "@/lib/defaults";
import { createHost, refreshHost, type HostInput } from "@/lib/hosts";

const defaultForm: HostInput = {
  name: "",
  ip_address: "",
  ssh_user: "",
  ssh_port: SSH_PORT_FALLBACK,
  groups: [],
  labels: [],
};

export function HostCreatePage() {
  const navigate = useNavigate();
  const { data: defaults } = useDefaults();
  const [form, setForm] = useState<HostInput>(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (defaults?.ssh_port != null) {
      setForm((f) => ({ ...f, ssh_port: defaults.ssh_port }));
    }
  }, [defaults?.ssh_port]);

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
        // Host created; probe failed (e.g. SSH not ready). User can probe later.
      }
      toast.success("Host created");
      navigate(`/?host=${result.host.id}`);
    } catch (error) {
      toastApiError(error, "Failed to create host");
    } finally {
      setSaving(false);
    }
  };

  const defPort = defaults?.ssh_port ?? SSH_PORT_FALLBACK;
  const itemLike = {
    name: form.name ?? "",
    ip_address: form.ip_address ?? "",
    ssh_user: form.ssh_user ?? "",
    ssh_port: form.ssh_port ?? defPort,
    labels: form.labels ?? [],
  };

  return (
    <CreatePageShell
      title="Add host"
      description="Add a hardware machine. You can configure SSH and placement later."
    >
      <div className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
        <ItemHardwareFields
          item={itemLike}
          defaultSshPort={defPort}
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
    </CreatePageShell>
  );
}
