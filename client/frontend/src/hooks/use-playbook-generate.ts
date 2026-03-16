import { useCallback, useRef, useState } from "react";
import { apiStreamPost } from "@/lib/api";

export type GenerationStep =
  | { step: "planning"; session_id: string }
  | {
      step: "planned";
      session_id: string;
      plan_name: string;
      plan_description: string;
      total_new: number;
      total_reuse: number;
    }
  | {
      step: "role_created";
      index: number;
      total: number;
      name: string;
      role_id: string;
    }
  | {
      step: "role_failed";
      index: number;
      total: number;
      name: string;
      error: string;
    }
  | { step: "assembling" }
  | { step: "done"; playbook_id: string };

type UsePlaybookGenerateOptions = {
  onComplete?: (playbookId: string) => void;
};

export function usePlaybookGenerate(options: UsePlaybookGenerateOptions = {}) {
  const [generating, setGenerating] = useState(false);
  const [steps, setSteps] = useState<GenerationStep[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (prompt: string, existingSessionId?: string | null) => {
      setGenerating(true);
      setError(null);
      setSteps([]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const body: Record<string, string> = { prompt };
        if (existingSessionId) {
          body.generation_session_id = existingSessionId;
        }

        const res = await apiStreamPost(
          "/playbooks/generate",
          body,
          controller.signal,
        );
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
            try {
              const event = JSON.parse(payload) as GenerationStep;
              setSteps((prev) => [...prev, event]);

              if ("session_id" in event && event.session_id) {
                setSessionId(event.session_id);
              }
              if (event.step === "done") {
                options.onComplete?.(event.playbook_id);
              }
            } catch {
              // skip malformed events
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setGenerating(false);
        abortRef.current = null;
      }
    },
    [options],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { generating, steps, sessionId, error, generate, cancel };
}
