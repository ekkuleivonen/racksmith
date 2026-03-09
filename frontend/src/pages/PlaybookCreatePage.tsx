import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PlaybookEditorForm } from "@/components/playbooks/playbook-editor-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { RoleCatalogEntry, PlaybookUpsertRequest } from "@/lib/playbooks";
import { createPlaybook, listPlaybooks } from "@/lib/playbooks";

const EMPTY_DRAFT: PlaybookUpsertRequest = {
  name: "",
  description: "",
  roles: [],
  become: false,
};

export function PlaybookCreatePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<PlaybookUpsertRequest>(EMPTY_DRAFT);
  const [roles_catalog, setRolesCatalog] = useState<RoleCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPlaybooks();
      setRolesCatalog(data.roles);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load playbook templates");
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
        <p className="text-zinc-500 text-sm">Loading playbook builder...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-1">
          <h1 className="text-zinc-100 font-semibold">Create playbook</h1>
          <p className="text-xs text-zinc-500">
            Add built-in roles to a new playbook and drag them into the order you want.
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
              placeholder="Playbook name"
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

        <PlaybookEditorForm
          draft={draft}
          roles={roles_catalog}
          onChange={setDraft}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={saving || !draft.name.trim() || draft.roles.length === 0}
            onClick={async () => {
              setSaving(true);
              try {
                const result = await createPlaybook(draft);
                toast.success("Playbook created");
                navigate(`/playbooks/${result.playbook.id}`);
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Failed to create playbook",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Creating..." : "Create playbook"}
          </Button>
        </div>
      </div>
    </div>
  );
}
