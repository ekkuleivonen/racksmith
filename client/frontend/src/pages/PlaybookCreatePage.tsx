import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";
import { CreatePageShell } from "@/components/shared/create-page-shell";
import { PageContainer } from "@/components/shared/page-container";
import { PlaybookEditorForm } from "@/components/playbooks/playbook-editor-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { RoleCatalogEntry, PlaybookUpsert } from "@/lib/playbooks";
import { createPlaybook, listPlaybooks } from "@/lib/playbooks";
import { useHosts, useGroups } from "@/hooks/queries";

const EMPTY_DRAFT: PlaybookUpsert = {
  name: "",
  description: "",
  roles: [],
  become: false,
};

export function PlaybookCreatePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<PlaybookUpsert>(EMPTY_DRAFT);
  const [roles_catalog, setRolesCatalog] = useState<RoleCatalogEntry[]>([]);
  const { data: hosts } = useHosts();
  const { data: groups } = useGroups();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPlaybooks();
      setRolesCatalog(data.roles);
    } catch (error) {
      toastApiError(error, "Failed to load playbook templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <PageContainer>
        <p className="text-zinc-500 text-sm">Loading playbook builder...</p>
      </PageContainer>
    );
  }

  return (
    <CreatePageShell
      title="Create playbook"
      description="Compose a playbook from existing roles. Use the AI button in the sidebar for natural-language help."
    >
      <section className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="space-y-1">
          <p className="text-xs text-zinc-400">Name</p>
          <Input
            value={draft.name}
            onChange={(e) =>
              setDraft((d: PlaybookUpsert) => ({
                ...d,
                name: e.target.value,
              }))
            }
            placeholder="Playbook name"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-zinc-400">Description</p>
          <Textarea
            value={draft.description}
            onChange={(e) =>
              setDraft((d: PlaybookUpsert) => ({
                ...d,
                description: e.target.value,
              }))
            }
            placeholder="Describe what this playbook does. Supports Markdown."
            className="min-h-32"
          />
          <p className="text-[10px] text-zinc-600">Supports Markdown</p>
        </div>
      </section>

      <PlaybookEditorForm
        draft={draft}
        roles={roles_catalog}
        hosts={hosts}
        groups={groups}
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
              toastApiError(error, "Failed to create playbook");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Creating..." : "Create playbook"}
        </Button>
      </div>
    </CreatePageShell>
  );
}
