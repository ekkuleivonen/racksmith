import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PlaybookEditorForm } from "@/components/playbooks/playbook-editor-form";
import type { PlaybookUpsertRequest, RoleTemplate } from "@/lib/playbooks";
import { createPlaybook, listPlaybooks } from "@/lib/playbooks";

const EMPTY_DRAFT: PlaybookUpsertRequest = {
  play_name: "",
  description: "",
  become: false,
  roles: [],
};

export function PlaybookCreatePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<PlaybookUpsertRequest>(EMPTY_DRAFT);
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPlaybooks();
      setRoleTemplates(data.role_templates);
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

        <PlaybookEditorForm
          draft={draft}
          roleTemplates={roleTemplates}
          submitLabel={saving ? "Creating..." : "Create playbook"}
          submitting={saving}
          onChange={setDraft}
          onSubmit={async () => {
            setSaving(true);
            try {
              const result = await createPlaybook(draft);
              toast.success("Playbook created");
              window.dispatchEvent(new Event("racksmith:sidebar-refresh"));
              navigate(`/playbooks/${result.playbook.id}`);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to create playbook");
            } finally {
              setSaving(false);
            }
          }}
        />
      </div>
    </div>
  );
}
