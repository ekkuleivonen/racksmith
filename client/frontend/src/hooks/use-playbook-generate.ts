import { useCallback, useRef, useState } from "react";
import { apiStreamPost } from "@/lib/api";

export type GenerationStep =
  | { step: "planning"; session_id: string }
  | { step: "thinking"; text: string }
  | {
      step: "planned";
      session_id: string;
      plan_name: string;
      plan_description: string;
      total_new: number;
      total_reuse: number;
    }
  | {
      step: "thinking_role";
      index: number;
      total: number;
      name: string;
      text: string;
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
  | { step: "done"; playbook_id: string }
  | { step: "error"; message: string };

type UsePlaybookGenerateOptions = {
  onComplete?: (playbookId: string) => void;
};

export function usePlaybookGenerate(options: UsePlaybookGenerateOptions = {}) {
  const [generating, setGenerating] = useState(false);
  const [steps, setSteps] = useState<GenerationStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (prompt: string) => {
      setGenerating(true);
      setError(null);
      setSteps([]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await apiStreamPost(
          "/playbooks/generate",
          { prompt },
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

              if (
                event.step === "thinking" ||
                event.step === "thinking_role"
              ) {
                setSteps((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.step === event.step) {
                    return [
                      ...prev.slice(0, -1),
                      { ...last, text: last.text + event.text },
                    ];
                  }
                  return [...prev, event];
                });
              } else {
                setSteps((prev) => [...prev, event]);
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
        const message =
          err instanceof Error ? err.message : "Generation failed";
        setError(message);
        setSteps((prev) => [...prev, { step: "error", message }]);
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

  return { generating, steps, error, generate, cancel };
}
