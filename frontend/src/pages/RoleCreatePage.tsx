import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Square, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { queryKeys } from "@/lib/queryClient";
import { createRoleFromYaml } from "@/lib/roles";

export function RoleCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [yaml, setYaml] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    setYaml("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/roles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: prompt.trim() }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          setYaml((prev) => prev + payload);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // user cancelled
      } else {
        setError(err instanceof Error ? err.message : "Generation failed");
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const { role } = await createRoleFromYaml(yaml);
      queryClient.invalidateQueries({ queryKey: queryKeys.playbooks });
      toast.success(`Role "${role.name}" created`);
      navigate("/roles");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-1">
          <h1 className="text-zinc-100 font-semibold">Create Role</h1>
          <p className="text-xs text-zinc-500">
            Define a new Ansible role using YAML. Use the AI wand to generate
            one from a description, or write it by hand.
          </p>
        </section>

        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-200">Role YAML</h2>
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

          {showPrompt && (
            <div className="flex items-center gap-2">
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the role you need, e.g. &quot;Install and configure Nginx with SSL&quot;"
                className="flex-1 text-sm"
                disabled={generating}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !generating) handleGenerate();
                }}
              />
              {generating ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
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
                  Generate
                </Button>
              )}
            </div>
          )}

          <Textarea
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            rows={22}
            readOnly={generating}
            className={`font-mono text-xs bg-zinc-950/60 ${generating ? "opacity-80" : ""}`}
            placeholder="Your role YAML will appear here..."
          />

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

          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={submitting || generating || !yaml.trim()}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Create role
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
