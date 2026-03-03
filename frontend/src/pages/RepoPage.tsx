import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileTree, type FileStatus, type TreeEntry } from "@/components/file-tree";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPut } from "@/lib/api";

const YAML_EXTENSIONS = [".yaml", ".yml"];

function isYamlPath(path: string | null): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return YAML_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function RepoPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { logout } = useAuth();
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadedContent, setLoadedContent] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPaths, setSavedPaths] = useState<Record<string, true>>({});

  const loadFileStatuses = useCallback(async () => {
    if (!owner || !repo) return;
    const data = await apiGet<{ saved_paths: string[] }>(
      `/repos/${owner}/${repo}/file-statuses`
    );
    setSavedPaths(Object.fromEntries(data.saved_paths.map((path) => [path, true])));
  }, [owner, repo]);

  const loadTree = useCallback(async () => {
    if (!owner || !repo) return;
    setLoading(true);
    try {
      const [data] = await Promise.all([
        apiGet<{ entries: TreeEntry[] }>(`/repos/${owner}/${repo}/tree`),
        loadFileStatuses(),
      ]);
      setEntries(data.entries);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load file tree");
    } finally {
      setLoading(false);
    }
  }, [loadFileStatuses, owner, repo]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const loadFile = useCallback(
    async (path: string) => {
      if (!owner || !repo) return;
      setSelectedPath(path);
      setContentLoading(true);
      setLoadedContent(null);
      setEditorValue("");
      try {
        const data = await apiGet<{ content: string }>(
          `/repos/${owner}/${repo}/file?path=${encodeURIComponent(path)}`
        );
        setLoadedContent(data.content);
        setEditorValue(data.content);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load file");
        setLoadedContent(null);
        setEditorValue("");
      } finally {
        setContentLoading(false);
      }
    },
    [owner, repo]
  );

  const selectedIsYaml = isYamlPath(selectedPath);
  const isDirty =
    selectedIsYaml && loadedContent !== null && editorValue !== loadedContent;
  const fileStatuses = useMemo<Record<string, FileStatus>>(() => {
    const statuses: Record<string, FileStatus> = {};
    for (const path of Object.keys(savedPaths)) {
      statuses[path] = "saved";
    }
    return statuses;
  }, [savedPaths]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      setEditorValue(value ?? "");
    },
    []
  );

  const saveFile = useCallback(async () => {
    if (!owner || !repo || !selectedPath || !selectedIsYaml || !isDirty) return;
    setIsSaving(true);
    try {
      await apiPut<{ status: string }>(`/repos/${owner}/${repo}/file`, {
        path: selectedPath,
        content: editorValue,
      });
      setLoadedContent(editorValue);
      await loadFileStatuses();
      toast.success("File saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save file");
    } finally {
      setIsSaving(false);
    }
  }, [
    editorValue,
    isDirty,
    loadFileStatuses,
    owner,
    repo,
    selectedIsYaml,
    selectedPath,
  ]);

  const fullName = owner && repo ? `${owner}/${repo}` : "";

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full">
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-zinc-100 font-semibold hover:text-zinc-300">
            RACKSMITH
          </Link>
          <span className="text-zinc-500">/</span>
          <Link
            to="/repos"
            className="text-zinc-400 hover:text-zinc-300"
          >
            Repositories
          </Link>
          <span className="text-zinc-500">/</span>
          <span className="text-zinc-300">{fullName}</span>
        </div>
        <div className="flex items-center gap-2">
          {selectedIsYaml && selectedPath && (
            <Button
              variant="secondary"
              size="sm"
              onClick={saveFile}
              disabled={!isDirty || contentLoading || isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={logout}>
            Logout
          </Button>
        </div>
      </header>

      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 min-h-0 w-full min-w-0"
        autoSaveId="repo-sidebar-v3"
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
        <ResizablePanel
          defaultSize="78%"
          minSize="30%"
          collapsible={false}
          className="min-w-0"
        >
          <main className="h-full overflow-auto p-4">
          {contentLoading ? (
            <p className="text-zinc-500 text-sm">Loading file...</p>
          ) : selectedPath && loadedContent !== null ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-500">{selectedPath}</p>
                {selectedIsYaml && (
                  <p className="text-xs text-zinc-500">
                    {isDirty ? "Unsaved changes" : "All changes saved"}
                  </p>
                )}
              </div>
              {selectedIsYaml ? (
                <div className="overflow-hidden rounded border border-zinc-800">
                  <Editor
                    height="calc(100vh - 13rem)"
                    defaultLanguage="yaml"
                    language="yaml"
                    value={editorValue}
                    onChange={handleEditorChange}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      wordWrap: "on",
                      automaticLayout: true,
                    }}
                  />
                </div>
              ) : (
                <pre className="text-sm text-zinc-300 bg-zinc-900/50 border border-zinc-800 rounded p-4 overflow-auto font-mono whitespace-pre-wrap break-words">
                  {loadedContent}
                </pre>
              )}
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
