import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { StackEditorForm } from "@/components/stacks/stack-editor-form";
import type { Action, StackUpsertRequest } from "@/lib/stacks";
import { createStack, listStacks } from "@/lib/stacks";
import { useStackStore } from "@/stores/stacks";
import { useRackStore } from "@/stores/racks";
import { useCodeStore } from "@/stores/code";

const EMPTY_DRAFT: StackUpsertRequest = {
  name: "",
  description: "",
  become: false,
  roles: [],
};

export function StackCreatePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<StackUpsertRequest>(EMPTY_DRAFT);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listStacks();
      setActions(data.actions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load stack templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="h-full overflow-auto p-6">
        <p className="text-zinc-500 text-sm">Loading stack builder...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-1">
          <h1 className="text-zinc-100 font-semibold">Create stack</h1>
          <p className="text-xs text-zinc-500">
            Add built-in roles to a new stack and drag them into the order you want.
          </p>
        </section>

        <StackEditorForm
          draft={draft}
          actions={actions}
          submitLabel={saving ? "Creating..." : "Create stack"}
          submitting={saving}
          onChange={setDraft}
          onSubmit={async () => {
            setSaving(true);
            try {
              const result = await createStack(draft);
              toast.success("Stack created");
              await Promise.all([
                useStackStore.getState().load(),
                useRackStore.getState().load(),
                useCodeStore.getState().refreshStatuses(),
              ]);
              navigate(`/stacks/${result.stack.id}`);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to create stack");
            } finally {
              setSaving(false);
            }
          }}
        />
      </div>
    </div>
  );
}
