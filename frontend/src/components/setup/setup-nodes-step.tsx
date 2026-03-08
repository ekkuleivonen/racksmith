import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ItemHardwareFields } from "@/components/racks/item-hardware-fields";
import { createNode, isManagedNode, refreshNode, type NodeInput } from "@/lib/nodes";
import { useNodes } from "@/hooks/queries";
import { usePingStore } from "@/stores/ping";
import { nodeStatusKey } from "@/lib/ssh";
import { cn } from "@/lib/utils";

const emptyForm: NodeInput = {
  name: "",
  ip_address: "",
  ssh_user: "",
  ssh_port: 22,
  managed: true,
  groups: [],
  labels: [],
  notes: "",
};

type SetupNodesStepProps = {
  onContinue: () => void;
  canContinue: boolean;
};

export function SetupNodesStep({ onContinue, canContinue }: SetupNodesStepProps) {
  const [form, setForm] = useState<NodeInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data: allNodes = [] } = useNodes();
  const nodes = allNodes.filter(isManagedNode);
  const pingStatuses = usePingStore((s) => s.statuses);

  const resetForm = useCallback(() => {
    setForm(emptyForm);
  }, []);

  const handleAddNode = useCallback(async () => {
    setSaving(true);
    try {
      const result = await createNode({
        ...form,
        name: form.name?.trim() ?? "",
        labels: form.labels ?? [],
        groups: form.groups ?? [],
      });
      resetForm();
      try {
        await refreshNode(result.node.id);
      } catch {
        // Node created; probe failed (e.g. SSH not ready). User can rediscover later.
      }
      const displayName =
        result.node.name || result.node.hostname || result.node.ip_address || result.node.id || "node";
      toast.success(`Added ${displayName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add node");
    } finally {
      setSaving(false);
    }
  }, [form, resetForm]);

  return (
    <div className="border border-zinc-800 bg-zinc-900/30 p-6">
      {nodes.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
            Added
          </p>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {nodes.map((node) => {
              const status = pingStatuses[nodeStatusKey(node.id)] ?? "unknown";
              return (
                <div
                  key={node.id}
                  className="flex items-center gap-2 border border-zinc-800 bg-zinc-900/50 px-3 py-2 rounded-sm"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      status === "online" && "bg-emerald-400",
                      status === "offline" && "bg-red-500",
                      status === "unknown" && "bg-zinc-600"
                    )}
                    title={
                      status === "online"
                        ? "Online"
                        : status === "offline"
                          ? "Offline"
                          : "Checking..."
                    }
                  />
                  <span className="text-xs text-zinc-100 truncate min-w-0">
                    {node.name || node.hostname || node.ip_address || node.id}
                  </span>
                  {node.labels && node.labels.length > 0 && (
                    <div className="flex gap-1 shrink-0 ml-auto">
                      {node.labels.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 font-normal"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Separator className="mb-4" />

      <ItemHardwareFields
        onboarding
        item={{
          ...form,
          managed: true,
          labels: form.labels ?? [],
          ip_address: form.ip_address ?? "",
          ssh_user: form.ssh_user ?? "",
          ssh_port: form.ssh_port ?? 22,
        }}
        onChange={(patch) =>
          setForm((prev) => ({ ...prev, ...patch, managed: true }))
        }
      />

      <div className="flex flex-col gap-2 mt-4">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void handleAddNode()} disabled={saving}>
            {saving ? "Adding..." : "Add node"}
          </Button>
          {canContinue && (
            <Button size="sm" variant="outline" onClick={onContinue}>
              Continue
            </Button>
          )}
        </div>
        <p className="text-[11px] text-zinc-500">
          Add at least one to continue. You can add more anytime from the Nodes page.
        </p>
      </div>
    </div>
  );
}
