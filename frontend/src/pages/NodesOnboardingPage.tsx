import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ItemHardwareFields } from "@/components/racks/item-hardware-fields";
import { createNode, refreshNode, type NodeInput } from "@/lib/nodes";
import { useNodesStore } from "@/stores/nodes";
import { usePingStore } from "@/stores/ping";
import { nodeStatusKey } from "@/lib/ssh";
import { cn } from "@/lib/utils";

const emptyForm: NodeInput = {
  name: "",
  host: "",
  ssh_user: "",
  ssh_port: 22,
  managed: true,
  groups: [],
  labels: [],
  notes: "",
};

export function NodesOnboardingPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<NodeInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showRackPrompt, setShowRackPrompt] = useState(false);

  const nodes = useNodesStore((s) => s.nodes);
  const loadNodes = useNodesStore((s) => s.load);
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
        await refreshNode(result.node.slug);
      } catch {
        // Node created; probe failed (e.g. SSH not ready). User can rediscover later.
      }
      await loadNodes();
      const displayName = result.node.name || result.node.slug || "node";
      toast.success(`Added ${displayName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add node");
    } finally {
      setSaving(false);
    }
  }, [form, loadNodes, resetForm]);

  const handleDone = useCallback(() => {
    if (nodes.length === 0) {
      toast.error("Add at least one node first");
      return;
    }
    setShowRackPrompt(true);
  }, [nodes.length]);

  const handleSkipRack = useCallback(() => {
    navigate("/nodes", { replace: true });
  }, [navigate]);

  const handleCreateRack = useCallback(() => {
    navigate("/rack/create", { replace: true });
  }, [navigate]);

  if (showRackPrompt) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <div className="max-w-xl mx-auto space-y-4 border border-zinc-800 bg-zinc-900/30 p-6">
          <div className="space-y-1">
            <h1 className="text-zinc-100 font-semibold">Place nodes on a rack?</h1>
            <p className="text-sm text-zinc-500">
              You added {nodes.length} node{nodes.length !== 1 ? "s" : ""}. Would you like to
              visualize them on a rack? You can skip and do this later.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSkipRack}>
              Skip for now
            </Button>
            <Button onClick={handleCreateRack}>Create rack</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-xl mx-auto space-y-4 border border-zinc-800 bg-zinc-900/30 p-6">
        <div className="space-y-1">
          <h1 className="text-zinc-100 font-semibold">Add your hardware</h1>
          <p className="text-sm text-zinc-500">
            Add one or more nodes. Each node is a machine you can SSH into and run stacks on.
            You can add more anytime from the Nodes page.
          </p>
        </div>

        {nodes.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
              Added
            </p>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {nodes.map((node) => {
                const status = pingStatuses[nodeStatusKey(node.slug)] ?? "unknown";
                return (
                  <div
                    key={node.slug}
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
                      {node.name || node.host || node.slug}
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

        <Separator />

        <ItemHardwareFields
          onboarding
          item={{
            ...form,
            managed: true,
            labels: form.labels ?? [],
            host: form.host ?? "",
            ssh_user: form.ssh_user ?? "",
            ssh_port: form.ssh_port ?? 22,
          }}
          onChange={(patch) =>
            setForm((prev) => ({ ...prev, ...patch, managed: true }))
          }
        />

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => void handleAddNode()}
              disabled={saving}
            >
              {saving ? "Adding..." : "Add node"}
            </Button>
            {nodes.length > 0 && (
              <Button size="sm" variant="outline" onClick={handleDone}>
                Done
              </Button>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">
            Add at least one to continue. You can add more anytime from the Nodes page.
          </p>
        </div>
      </div>
    </div>
  );
}
