import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Loader2,
  Sparkles,
  Square,
  Wand2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { YamlFileView } from "@/components/files/yaml-file-view";
import {
  useAgentStream,
  type AgentStep,
} from "@/hooks/use-agent-stream";

function ToolLabel({ tool }: { tool: string }) {
  const labels: Record<string, string> = {
    list_roles: "Browsing existing roles",
    get_role_detail: "Inspecting role",
    create_role: "Creating role",
    update_role: "Updating role",
    create_playbook: "Assembling playbook",
    get_playbook: "Reading playbook",
    update_playbook: "Updating playbook",
  };
  return <>{labels[tool] ?? tool}</>;
}

function AgentStepIndicator({
  step,
  expanded,
  onToggle,
}: {
  step: AgentStep;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current && expanded) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [step, expanded]);

  switch (step.type) {
    case "thinking":
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
            <span className="truncate">AI reasoning</span>
          </button>
          {expanded && (
            <pre
              ref={ref}
              className="mt-1 ml-[18px] max-h-28 overflow-y-auto rounded bg-zinc-950/80 p-2 text-[11px] leading-relaxed text-zinc-500 whitespace-pre-wrap"
            >
              {step.text}
            </pre>
          )}
        </div>
      );
    case "tool_call":
      return (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Wrench className="size-3 shrink-0" />
          <ToolLabel tool={step.tool} />
          {step.args && "name" in step.args && (
            <span className="text-zinc-500">
              — {String(step.args.name)}
            </span>
          )}
          <Loader2 className="size-3 animate-spin ml-auto" />
        </div>
      );
    case "tool_result":
      return (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Check className="size-3 shrink-0" />
          <ToolLabel tool={step.tool} />
        </div>
      );
    case "done":
      return null;
    case "error":
      return (
        <div className="flex items-center gap-2 text-xs text-red-400">
          {step.message}
        </div>
      );
  }
}

export interface YamlEditorWithAiProps {
  value: string;
  onChange: (v: string) => void;
  apiEndpoint: string;
  buildBody: (prompt: string) => unknown;
  height?: string;
  placeholder?: string;
  generateButtonLabel?: string;
  headerTitle?: string;
  headerActions?: React.ReactNode;
  editorHidden?: boolean;
  onBeforeGenerate?: () => void;
  onGeneratingChange?: (generating: boolean) => void;
}

export function YamlEditorWithAi({
  value,
  onChange,
  apiEndpoint,
  buildBody,
  height = "400px",
  placeholder = 'Describe the role you need, e.g. "Install and configure Nginx with SSL"',
  generateButtonLabel = "Generate",
  headerTitle = "Role YAML",
  headerActions,
  editorHidden = false,
  onBeforeGenerate,
  onGeneratingChange,
}: YamlEditorWithAiProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const { thinking, steps, result, generating, error, generate, cancel } =
    useAgentStream({
      onComplete: (done) => {
        if (done.yaml) {
          onChange(done.yaml);
        }
      },
    });

  useEffect(() => {
    onGeneratingChange?.(generating);
  }, [generating, onGeneratingChange]);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setExpandedSteps(new Set());
    const body = buildBody(prompt.trim());
    onBeforeGenerate?.();
    await generate(apiEndpoint, body);
  }

  const isThinkingPhase = generating && thinking && !result;
  const displayValue = result?.yaml ?? value;

  const visibleSteps = steps.filter(
    (s) => s.type !== "done",
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-200">{headerTitle}</h2>
        <div className="flex gap-2">
          {headerActions}
          <Button
            variant={showPrompt ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowPrompt((v) => !v)}
            disabled={generating}
            title="AI generate"
          >
            <Wand2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {showPrompt && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholder}
            className="flex-1 text-sm min-h-20"
            disabled={generating}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !generating) {
                e.preventDefault();
                handleGenerate();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            {generating ? (
              <Button
                variant="outline"
                size="sm"
                onClick={cancel}
                title="Stop generation"
              >
                <Square className="size-3.5" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={!prompt.trim()}
              >
                <Wand2 className="size-3.5" />
                {generateButtonLabel}
              </Button>
            )}
          </div>
        </div>
      )}

      {visibleSteps.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/60 p-3 space-y-1">
          {visibleSteps.map((step, i) => {
            const isLast = i === visibleSteps.length - 1;
            const expanded =
              step.type === "thinking"
                ? isLast || expandedSteps.has(i)
                : false;
            return (
              <AgentStepIndicator
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
        </div>
      )}

      {editorHidden ? (
        <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400 font-mono max-h-[500px]">
          {value}
        </pre>
      ) : (
        <div
          className={`border border-zinc-800 overflow-hidden ${generating ? "opacity-80" : ""}`}
        >
          <YamlFileView
            value={displayValue}
            onChange={onChange}
            readOnly={generating}
            height={height}
          />
        </div>
      )}

      {generating && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" />
          {isThinkingPhase ? "Thinking..." : "Generating..."}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
