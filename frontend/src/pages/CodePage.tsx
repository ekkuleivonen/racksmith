import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getCodeViewForFile } from "@/components/code/get-code-view-for-file";
import { FileTree, type FileStatus, type TreeEntry } from "@/components/code/file-tree";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { apiGet, apiPut } from "@/lib/api";

export function CodePage() {
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadedContent, setLoadedContent] = useState<string | null>(null);
  const [codeValue, setCodeValue] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [modifiedPaths, setModifiedPaths] = useState<Record<string, true>>({});

  const loadFileStatuses = useCallback(async () => {
    const data = await apiGet<{ modified_paths: string[] }>("/code/file-statuses");
    setModifiedPaths(Object.fromEntries(data.modified_paths.map((path) => [path, true])));
  }, []);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const [data] = await Promise.all([
        apiGet<{ entries: TreeEntry[] }>("/code/tree"),
        loadFileStatuses(),
      ]);
      setEntries(data.entries);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load file tree");
    } finally {
      setLoading(false);
    }
  }, [loadFileStatuses]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const loadFile = useCallback(async (path: string) => {
    setSelectedPath(path);
    setContentLoading(true);
    setLoadedContent(null);
    setCodeValue("");
    try {
      const data = await apiGet<{ content: string }>(`/code/file?path=${encodeURIComponent(path)}`);
      setLoadedContent(data.content);
      setCodeValue(data.content);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load file");
      setLoadedContent(null);
      setCodeValue("");
    } finally {
      setContentLoading(false);
    }
  }, []);

  const isDirty = loadedContent !== null && codeValue !== loadedContent;
  const ActiveCodeView = useMemo(() => getCodeViewForFile(selectedPath), [selectedPath]);
  const modifiedCount = Object.keys(modifiedPaths).length;

  const fileStatuses = useMemo<Record<string, FileStatus>>(() => {
    const statuses: Record<string, FileStatus> = {};
    for (const path of Object.keys(modifiedPaths)) {
      statuses[path] = "modified";
    }
    return statuses;
  }, [modifiedPaths]);

  const saveFile = useCallback(async () => {
    if (!selectedPath || !isDirty) return;
    setIsSaving(true);
    try {
      await apiPut<{ status: string }>("/code/file", {
        path: selectedPath,
        content: codeValue,
      });
      setLoadedContent(codeValue);
      await loadFileStatuses();
      toast.success("File saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save file");
    } finally {
      setIsSaving(false);
    }
  }, [codeValue, isDirty, loadFileStatuses, selectedPath]);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full">
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <div>
          <p className="text-zinc-100 font-medium">Code</p>
          <p className="text-xs text-zinc-500">
            Browse and edit files from the active local repo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-zinc-500">{modifiedCount} modified file(s)</p>
          {selectedPath && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void saveFile()}
              disabled={!isDirty || contentLoading || isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </header>

      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 min-h-0 w-full min-w-0"
        autoSave="code-sidebar-v1"
      >
        <ResizablePanel
          defaultSize="22%"
          minSize="18%"
          maxSize="50%"
          collapsible={false}
          className="border-r border-zinc-800 bg-zinc-950/50"
        >
          <div className="h-full overflow-auto">
            <div className="p-2">
              <p className="text-xs text-zinc-500 uppercase tracking-wider px-2 py-1">
                Files
              </p>
              {loading ? (
                <p className="text-zinc-500 text-sm py-4 px-2">Loading...</p>
              ) : (
                <FileTree
                  entries={entries}
                  selectedPath={selectedPath}
                  onSelectFile={loadFile}
                  fileStatuses={fileStatuses}
                />
              )}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-zinc-800" />
        <ResizablePanel defaultSize="78%" minSize="30%" collapsible={false} className="min-w-0">
          <main className="h-full overflow-auto p-4">
            {contentLoading ? (
              <p className="text-zinc-500 text-sm">Loading file...</p>
            ) : selectedPath && loadedContent !== null ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">{selectedPath}</p>
                  <p className="text-xs text-zinc-500">
                    {isDirty ? "Unsaved changes" : "All changes saved"}
                  </p>
                </div>
                <div className="overflow-hidden rounded border border-zinc-800">
                  <ActiveCodeView value={codeValue} onChange={(value) => setCodeValue(value ?? "")} />
                </div>
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">
                Select a file from the sidebar to view its contents.
              </p>
            )}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
