import { useEffect, useState } from "react";
import { Loader2, Square, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { YamlFileView } from "@/components/files/yaml-file-view";
import { useStreamingYaml } from "@/hooks/use-streaming-yaml";

export interface YamlEditorWithAiProps {
  value: string;
  onChange: (v: string) => void;
  apiEndpoint: string;
  buildBody: (prompt: string) => unknown;
  height?: string;
  placeholder?: string;
  generateButtonLabel?: string;
  headerTitle?: string;
  /** Optional actions to render next to the Wand button (e.g. Edit button) */
  headerActions?: React.ReactNode;
  /** When true, show read-only pre instead of YamlFileView (e.g. before user has clicked Edit) */
  editorHidden?: boolean;
  /** Called before generate starts - use to e.g. switch to editing mode */
  onBeforeGenerate?: () => void;
  /** Called when generating state changes - use to e.g. disable submit button */
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

  const { yaml, generating, error, generate, cancel } = useStreamingYaml({
    onComplete: (formatted) => onChange(formatted),
  });

  useEffect(() => {
    onGeneratingChange?.(generating);
  }, [generating, onGeneratingChange]);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    const body = buildBody(prompt.trim());
    onBeforeGenerate?.();
    await generate(apiEndpoint, body);
  }

  const displayValue = generating ? yaml : value;

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
          Generating...
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
