import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toastApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EntityListPage } from "@/components/shared/entity-list-page";
import type { PlaybookSummary } from "@/lib/playbooks";
import { listPlaybooks } from "@/lib/playbooks";

export function PlaybooksPage() {
  const navigate = useNavigate();
  const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPlaybooks();
      setPlaybooks(data.playbooks);
    } catch (error) {
      toastApiError(error, "Failed to load playbooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <EntityListPage
      title="Playbooks"
      description="Browse native Ansible playbooks stored in the active repo."
      createPath="/playbooks/create"
      createLabel="Create playbook"
      isLoading={loading}
      isEmpty={playbooks.length === 0}
      emptyTitle="No playbooks yet."
      emptySecondaryAction={{ label: "Import from registry", path: "/registry" }}
      headerExtra={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </Button>
      }
    >
      <div className="space-y-2">
        {playbooks.map((playbook) => (
          <button
            key={playbook.id}
            type="button"
            className="w-full border border-zinc-800 bg-zinc-950/40 p-3 text-left hover:border-zinc-700"
            onClick={() => navigate(`/playbooks/${playbook.id}`)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm text-zinc-100">{playbook.name}</p>
                {playbook.description ? (
                  <p className="text-xs text-zinc-400">{playbook.description}</p>
                ) : null}
              </div>
              <p className="text-[11px] text-zinc-500">{playbook.roles.length} roles</p>
            </div>
          </button>
        ))}
      </div>
    </EntityListPage>
  );
}
