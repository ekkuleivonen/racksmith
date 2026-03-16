import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  CircleAlert,
  Loader2,
  Square,
  Wand2,
} from "lucide-react";
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
import {
  usePlaybookGenerate,
  type GenerationStep,
} from "@/hooks/use-playbook-generate";

const EMPTY_DRAFT: PlaybookUpsert = {
  name: "",
  description: "",
  roles: [],
  become: false,
};

function StepIndicator({ step }: { step: GenerationStep }) {
  switch (step.step) {
    case "planning":
      return (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 className="size-3 animate-spin" />
          Planning playbook...
        </div>
      );
    case "planned":
      return (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Check className="size-3" />
          Planned "{step.plan_name}" — {step.total_new} role
          {step.total_new !== 1 ? "s" : ""} to create
          {step.total_reuse > 0 &&
            `, ${step.total_reuse} reused`}
        </div>
      );
    case "role_created":
      return (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Check className="size-3" />
          Created role {step.index}/{step.total}: {step.name}
        </div>
      );
    case "role_failed":
      return (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <CircleAlert className="size-3" />
          Failed role {step.index}/{step.total}: {step.name}
        </div>
      );
    case "assembling":
      return (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 className="size-3 animate-spin" />
          Assembling playbook...
        </div>
      );
    case "done":
      return (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Check className="size-3" />
          Playbook ready!
        </div>
      );
  }
}

export function PlaybookCreatePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<PlaybookUpsert>(EMPTY_DRAFT);
  const [roles_catalog, setRolesCatalog] = useState<RoleCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState("");

  const {
    generating,
    steps,
    sessionId,
    error: genError,
    generate,
    cancel,
  } = usePlaybookGenerate({
    onComplete: (playbookId) => {
      toast.success("Playbook generated");
      navigate(`/playbooks/${playbookId}`);
    },
  });

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
      description="Use AI to generate a full playbook from a description, or build one manually with existing roles."
    >
      {/* AI generation section */}
      <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-200">AI Generate</h2>
          <Button
            variant={showPrompt ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowPrompt((v) => !v)}
            disabled={generating}
          >
            <Wand2 className="size-3.5" />
          </Button>
        </div>

        {showPrompt && (
          <div className="space-y-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='Describe the playbook you need, e.g. "Format an SSD, create mount directories, and mount them reliably across reboots"'
              className="text-sm min-h-20"
              disabled={generating}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !generating) {
                  e.preventDefault();
                  if (prompt.trim()) {
                    void generate(prompt.trim(), sessionId);
                  }
                }
              }}
            />

            <div className="flex justify-end gap-2">
              {generating ? (
                <Button variant="outline" size="sm" onClick={cancel}>
                  <Square className="size-3.5" />
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => void generate(prompt.trim(), sessionId)}
                  disabled={!prompt.trim()}
                >
                  <Wand2 className="size-3.5" />
                  {sessionId ? "Follow up" : "Generate"}
                </Button>
              )}
            </div>

            {steps.length > 0 && (
              <div className="space-y-1.5 rounded border border-zinc-800 bg-zinc-950/60 p-3">
                {steps.map((step, i) => (
                  <StepIndicator key={i} step={step} />
                ))}
              </div>
            )}

            {genError && (
              <div className="rounded border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-400">
                {genError}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Manual creation section */}
      <section className="space-y-4 border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="space-y-1">
          <p className="text-xs text-zinc-400">Name</p>
          <Input
            value={draft.name}
            onChange={(e) =>
              setDraft((d: PlaybookUpsert) => ({ ...d, name: e.target.value }))
            }
            placeholder="Playbook name"
            disabled={generating}
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
            placeholder="Short description shown in the UI."
            className="min-h-20"
            disabled={generating}
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
          disabled={
            saving || generating || !draft.name.trim() || draft.roles.length === 0
          }
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
