import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getFileViewForFile } from "@/components/files/get-file-view";
import { toastApiError } from "@/lib/api";
import { getFileContent, updateFile } from "@/lib/files";
import { invalidateResource } from "@/lib/queryClient";

const AUTOSAVE_DELAY_MS = 600;

export function FilesPage() {
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
        const content = await getFileContent(path);
        setLoadedContent(content);
        setCodeValue(content);
      } catch (error) {
        toastApiError(error, "Failed to load file");
        setLoadedContent(null);
        setCodeValue("");
        const owner = params.owner as string | undefined;
        const repo = params.repo as string | undefined;
        if (owner && repo) {
          navigate(`/files/${owner}/${repo}`, { replace: true });
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
          await updateFile(path, content);
          setLoadedContent(content);
          invalidateResource("filesStatuses");
        } catch (error) {
          toastApiError(error, "Failed to save file");
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

  const ActiveFileView = useMemo(
    () => getFileViewForFile(filePath),
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
              <ActiveFileView value={codeValue} onChange={handleChange} />
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
