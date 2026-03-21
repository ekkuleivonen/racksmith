import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Loader2,
  Sparkles,
  Square,
  Wand2,
  Wrench,
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
import { useHosts, useGroups } from "@/hooks/queries";
import {
  useAgentStream,
  type AgentStep,
} from "@/hooks/use-agent-stream";

const EMPTY_DRAFT: PlaybookUpsert = {
  name: "",
  description: "",
  roles: [],
  become: false,
};

function ToolLabel({ tool }: { tool: string }) {
  const labels: Record<string, string> = {
    list_roles: "Browsing existing roles",
    get_role_detail: "Inspecting role",
    create_role: "Creating role",
    create_playbook: "Assembling playbook",
  };
  return <>{labels[tool] ?? tool}</>;
}

function ThinkingBlock({
  text,
  label,
  expanded,
  onToggle,
}: {
  text: string;
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current && expanded) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [text, expanded]);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs text-violet-400/80 hover:text-violet-300 transition-colors w-full text-left"
      >
        <ChevronRight
          className={`size-3 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <Sparkles className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      {expanded && (
        <pre
          ref={ref}
          className="mt-1 ml-[18px] max-h-28 overflow-y-auto rounded bg-zinc-950/80 p-2 text-[11px] leading-relaxed text-zinc-500 whitespace-pre-wrap"
        >
          {text}
        </pre>
      )}
    </div>
  );
}

function StepIndicator({
  step,
  expanded,
  onToggle,
}: {
  step: AgentStep;
  expanded: boolean;
  onToggle: () => void;
}) {
  switch (step.type) {
    case "thinking":
      return (
        <ThinkingBlock
          text={step.text}
          label="AI reasoning"
          expanded={expanded}
          onToggle={onToggle}
        />
      );
    case "tool_call":
      return (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Wrench className="size-3 shrink-0" />
          <ToolLabel tool={step.tool} />
          {step.args && "name" in step.args && (
            <span className="text-zinc-500 truncate">
              — {String(step.args.name)}
            </span>
          )}
          <Loader2 className="size-3 animate-spin ml-auto shrink-0" />
        </div>
      );
    case "tool_result":
      return (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Check className="size-3 shrink-0" />
          <ToolLabel tool={step.tool} />
          {step.result && (
            <span className="text-zinc-500 truncate">
              — {step.result.slice(0, 80)}
            </span>
          )}
        </div>
      );
    case "done":
      return (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Check className="size-3" />
          Playbook ready!
        </div>
      );
    case "error":
      return (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <CircleAlert className="size-3" />
          {step.message}
        </div>
      );
  }
}

export function PlaybookCreatePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<PlaybookUpsert>(EMPTY_DRAFT);
  const [roles_catalog, setRolesCatalog] = useState<RoleCatalogEntry[]>([]);
  const { data: hosts } = useHosts();
  const { data: groups } = useGroups();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const stepsEndRef = useRef<HTMLDivElement>(null);

  const {
    generating,
    steps,
    error: genError,
    generate: rawGenerate,
    cancel,
  } = useAgentStream({
    onComplete: (done) => {
      if (done.playbook_id) {
        toast.success("Playbook generated");
        setCompletedId(done.playbook_id);
      }
    },
  });

  const generate = useCallback(
    (p: string) => {
      setCompletedId(null);
      setExpandedSteps(new Set());
      return rawGenerate("/playbooks/generate", { prompt: p });
    },
    [rawGenerate],
  );

  const aiActive = generating || completedId !== null || steps.length > 0;

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [steps.length]);

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
                    void generate(prompt.trim());
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
                  onClick={() => void generate(prompt.trim())}
                  disabled={!prompt.trim()}
                >
                  <Wand2 className="size-3.5" />
                  Generate
                </Button>
              )}
            </div>

            {steps.length > 0 && (
              <div className="max-h-80 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/60 p-3 space-y-1">
                {steps.map((step, i) => {
                  const isLast = i === steps.length - 1;
                  const expanded =
                    step.type === "thinking"
                      ? isLast || expandedSteps.has(i)
                      : false;
                  return (
                    <StepIndicator
                      key={i}
                      step={step}
                      expanded={expanded}
                      onToggle={() =>
                        setExpandedSteps((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                    />
                  );
                })}
                <div ref={stepsEndRef} />
              </div>
            )}

            {completedId && (
              <Button
                size="sm"
                onClick={() => navigate(`/playbooks/${completedId}`)}
                className="w-full"
              >
                View Playbook
                <ArrowRight className="size-3.5" />
              </Button>
            )}

            {genError && (
              <div className="rounded border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-400">
                {genError}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Manual creation section — hidden while AI is active */}
      {!aiActive && (
        <>
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
              disabled={
                saving || !draft.name.trim() || draft.roles.length === 0
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
        </>
      )}
    </CreatePageShell>
  );
}
