import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getCodeViewForFile } from "@/components/code/get-code-view-for-file";
import { apiGet, apiPut } from "@/lib/api";
import { queryClient, queryKeys } from "@/lib/queryClient";

const AUTOSAVE_DELAY_MS = 600;

export function CodePage() {
  const params = useParams();
  const navigate = useNavigate();
  const filePath = (params["*"] || null) as string | null;

  const [loadedContent, setLoadedContent] = useState<string | null>(null);
  const [codeValue, setCodeValue] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);

  const saveTimeoutRef = useRef<number | null>(null);

  const loadFile = useCallback(
    async (path: string) => {
      setContentLoading(true);
      setLoadedContent(null);
      setCodeValue("");
      try {
        const data = await apiGet<{ content: string }>(
          `/code/file?path=${encodeURIComponent(path)}`,
        );
        setLoadedContent(data.content);
        setCodeValue(data.content);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load file",
        );
        setLoadedContent(null);
        setCodeValue("");
        const owner = params.owner as string | undefined;
        const repo = params.repo as string | undefined;
        if (owner && repo) {
          navigate(`/code/${owner}/${repo}`, { replace: true });
        }
      } finally {
        setContentLoading(false);
      }
    },
    [params.owner, params.repo, navigate],
  );

  useEffect(() => {
    if (filePath) {
      void loadFile(filePath);
    } else {
      setLoadedContent(null);
      setCodeValue("");
    }
    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [filePath, loadFile]);

  const debouncedSave = useCallback(
    (path: string, content: string) => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(async () => {
        saveTimeoutRef.current = null;
        try {
          await apiPut<{ status: string }>("/code/file", {
            path,
            content,
          });
          setLoadedContent(content);
          void queryClient.invalidateQueries({ queryKey: queryKeys.codeStatuses });
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Failed to save file",
          );
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [],
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      const next = value ?? "";
      setCodeValue(next);
      if (filePath && loadedContent !== null) {
        debouncedSave(filePath, next);
      }
    },
    [filePath, loadedContent, debouncedSave],
  );

  const ActiveCodeView = useMemo(
    () => getCodeViewForFile(filePath),
    [filePath],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full">
      <main className="flex-1 overflow-auto p-4 min-h-0">
        {contentLoading ? (
          <p className="text-zinc-500 text-sm">Loading file...</p>
        ) : filePath && loadedContent !== null ? (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">{filePath}</p>
            <div className="overflow-hidden rounded border border-zinc-800">
              <ActiveCodeView value={codeValue} onChange={handleChange} />
            </div>
          </div>
        ) : (
          <p className="text-zinc-500 text-sm">
            Select a file from the sidebar to view its contents.
          </p>
        )}
      </main>
    </div>
  );
}
