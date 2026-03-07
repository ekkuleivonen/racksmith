import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { StackSummary } from "@/lib/stacks";
import { listStacks } from "@/lib/stacks";

export function StacksPage() {
  const navigate = useNavigate();
  const [stacks, setStacks] = useState<StackSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listStacks();
      setStacks(data.stacks);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load stacks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-1">
          <h1 className="text-zinc-100 font-semibold">Stacks</h1>
          <p className="text-xs text-zinc-500">
            Browse native Ansible stacks stored in the active repo.
          </p>
        </section>

        <section className="space-y-3 border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-zinc-100 font-medium">Existing stacks</p>
              <p className="text-xs text-zinc-500">
                Open a stack to edit or run it, or create a new one from the builder.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate("/stacks/create")}>
              Create stack
            </Button>
          </div>
          {loading ? (
            <p className="text-zinc-500 text-sm">Loading stacks...</p>
          ) : stacks.length === 0 ? (
            <p className="text-zinc-500 text-sm">No stacks yet.</p>
          ) : (
            <div className="space-y-2">
              {stacks.map((stack) => (
                <button
                  key={stack.id}
                  type="button"
                  className="w-full border border-zinc-800 bg-zinc-950/40 p-3 text-left hover:border-zinc-700"
                  onClick={() => navigate(`/stacks/${stack.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm text-zinc-100">{stack.name}</p>
                      {stack.description ? (
                        <p className="text-xs text-zinc-400">{stack.description}</p>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-zinc-500">{stack.roles.length} roles</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}
