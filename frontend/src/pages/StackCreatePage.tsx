import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { StackEditorForm } from "@/components/stacks/stack-editor-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Action, StackUpsertRequest } from "@/lib/stacks";
import { createStack, listStacks } from "@/lib/stacks";

const EMPTY_DRAFT: StackUpsertRequest = {
  name: "",
  description: "",
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

        <section className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="space-y-1">
            <p className="text-xs text-zinc-400">Name</p>
            <Input
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
              placeholder="Stack name"
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-zinc-400">Description</p>
            <Textarea
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              placeholder="Short description shown in the UI."
              className="min-h-20"
            />
          </div>
        </section>

        <StackEditorForm
          draft={draft}
          actions={actions}
          onChange={setDraft}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={saving || !draft.name.trim() || draft.roles.length === 0}
            onClick={async () => {
              setSaving(true);
              try {
                const result = await createStack(draft);
                toast.success("Stack created");
                navigate(`/stacks/${result.stack.id}`);
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Failed to create stack",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Creating..." : "Create stack"}
          </Button>
        </div>
      </div>
    </div>
  );
}
