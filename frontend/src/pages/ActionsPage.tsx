import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ActionSummary } from "@/lib/actions";
import { listActions } from "@/lib/actions";

export function ActionsPage() {
  const navigate = useNavigate();
  const [actions, setActions] = useState<ActionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listActions();
      setActions(data.actions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load actions");
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
          <h1 className="text-zinc-100 font-semibold">Actions</h1>
          <p className="text-xs text-zinc-500">
            Reusable Ansible roles with typed inputs. Run them directly or compose them into stacks.
          </p>
        </section>

        <section className="space-y-3 border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-zinc-100 font-medium">Existing actions</p>
              <p className="text-xs text-zinc-500">
                Open an action to run it, edit it, or view run history.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate("/actions/create")}>
              Create action
            </Button>
          </div>
          {loading ? (
            <p className="text-zinc-500 text-sm">Loading actions...</p>
          ) : actions.length === 0 ? (
            <p className="text-zinc-500 text-sm">No actions yet.</p>
          ) : (
            <div className="space-y-2">
              {actions.map((action) => (
                <button
                  key={action.slug}
                  type="button"
                  className="w-full border border-zinc-800 bg-zinc-950/40 p-3 text-left hover:border-zinc-700"
                  onClick={() => navigate(`/actions/${action.slug}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm text-zinc-100">{action.name}</p>
                      {action.description ? (
                        <p className="text-xs text-zinc-400">{action.description}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-[10px]">
                        {action.source}
                      </Badge>
                      <span className="text-[11px] text-zinc-500">
                        {action.inputs.length} input{action.inputs.length === 1 ? "" : "s"}
                      </span>
                    </div>
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
