import { useCallback, useRef, useState } from "react";
import { apiStreamPost } from "@/lib/api";

export type AgentStepThinking = { type: "thinking"; text: string };
export type AgentStepToolCall = {
  type: "tool_call";
  tool: string;
  args: Record<string, unknown>;
};
export type AgentStepToolResult = {
  type: "tool_result";
  tool: string;
  result: string;
};
export type AgentStepDone = {
  type: "done";
  yaml?: string;
  playbook_id?: string;
  message?: string;
};
export type AgentStepError = { type: "error"; message: string };

export type AgentStep =
  | AgentStepThinking
  | AgentStepToolCall
  | AgentStepToolResult
  | AgentStepDone
  | AgentStepError;

type UseAgentStreamOptions = {
  onComplete?: (result: AgentStepDone) => void;
};

export function useAgentStream(options: UseAgentStreamOptions = {}) {
  const [thinking, setThinking] = useState("");
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [result, setResult] = useState<AgentStepDone | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (path: string, body: unknown) => {
      setGenerating(true);
      setError(null);
      setThinking("");
      setSteps([]);
      setResult(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await apiStreamPost(path, body, controller.signal);
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
              const event = JSON.parse(payload) as AgentStep;

              if (event.type === "thinking") {
                setThinking((prev) => prev + event.text);
                setSteps((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.type === "thinking") {
                    return [
                      ...prev.slice(0, -1),
                      { ...last, text: last.text + event.text },
                    ];
                  }
                  return [...prev, event];
                });
              } else if (event.type === "done") {
                setResult(event);
                setSteps((prev) => [...prev, event]);
                options.onComplete?.(event);
              } else if (event.type === "error") {
                setError(event.message);
                setSteps((prev) => [...prev, event]);
              } else {
                setSteps((prev) => [...prev, event]);
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
        setSteps((prev) => [
          ...prev,
          { type: "error", message } as AgentStepError,
        ]);
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

  return { thinking, steps, result, generating, error, generate, cancel };
}
