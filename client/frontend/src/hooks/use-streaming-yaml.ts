import { useCallback, useRef, useState } from "react";
import { apiStreamPost } from "@/lib/api";

type StreamingYamlOptions = {
  initialYaml?: string;
  onComplete?: (yaml: string) => void;
};

export function useStreamingYaml(options: StreamingYamlOptions = {}) {
  const [yaml, setYaml] = useState(options.initialYaml ?? "");
  const [thinking, setThinking] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (path: string, body: unknown) => {
      setGenerating(true);
      setError(null);
      setYaml("");
      setThinking("");

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
              const decoded = JSON.parse(payload) as unknown;
              if (
                typeof decoded === "object" &&
                decoded !== null &&
                "thinking" in decoded
              ) {
                setThinking(
                  (prev) => prev + (decoded as { thinking: string }).thinking,
                );
              } else if (typeof decoded === "string") {
                setYaml((prev) => prev + decoded);
              } else {
                setYaml((prev) => prev + payload);
              }
            } catch {
              setYaml((prev) => prev + payload);
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
        setYaml((final_yaml) => {
          options.onComplete?.(final_yaml);
          return final_yaml;
        });
      }
    },
    [options],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    yaml,
    setYaml,
    thinking,
    generating,
    error,
    setError,
    generate,
    cancel,
  };
}
