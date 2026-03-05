import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getEditorForFile } from "@/components/editors/get-editor-for-file";
import { FileTree, type FileStatus, type TreeEntry } from "@/components/file-tree";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPost, apiPut } from "@/lib/api";

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
  const [modifiedPaths, setModifiedPaths] = useState<Record<string, true>>({});
  const [prDialogOpen, setPrDialogOpen] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prMessage, setPrMessage] = useState("");
  const [isCreatingPr, setIsCreatingPr] = useState(false);

  const loadFileStatuses = useCallback(async () => {
    if (!owner || !repo) return;
    const data = await apiGet<{ modified_paths: string[] }>(
      `/repos/${owner}/${repo}/file-statuses`
    );
    setModifiedPaths(Object.fromEntries(data.modified_paths.map((path) => [path, true])));
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

  const isDirty = loadedContent !== null && editorValue !== loadedContent;
  const ActiveEditor = useMemo(() => getEditorForFile(selectedPath), [selectedPath]);
  const modifiedCount = Object.keys(modifiedPaths).length;
  const fileStatuses = useMemo<Record<string, FileStatus>>(() => {
    const statuses: Record<string, FileStatus> = {};
    for (const path of Object.keys(modifiedPaths)) {
      statuses[path] = "modified";
    }
    return statuses;
  }, [modifiedPaths]);
  const modifiedFileList = useMemo(
    () => Object.keys(modifiedPaths).sort(),
    [modifiedPaths]
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      setEditorValue(value ?? "");
    },
    []
  );

  const saveFile = useCallback(async () => {
    if (!owner || !repo || !selectedPath || !isDirty) return;
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
    selectedPath,
  ]);

  const createPr = useCallback(async () => {
    if (!owner || !repo) return;
    const title = prTitle.trim();
    if (!title) {
      toast.error("PR name is required");
      return;
    }

    setIsCreatingPr(true);
    try {
      const data = await apiPost<{
        url: string;
        number: number;
        branch: string;
        base: string;
      }>(`/repos/${owner}/${repo}/pull-request`, {
        title,
        message: prMessage,
      });
      setPrDialogOpen(false);
      setPrTitle("");
      setPrMessage("");
      await loadFileStatuses();
      toast.success(`PR #${data.number} created`);
      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create PR");
    } finally {
      setIsCreatingPr(false);
    }
  }, [loadFileStatuses, owner, prMessage, prTitle, repo]);

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPrDialogOpen(true)}
            disabled={modifiedCount === 0 || isSaving || isCreatingPr}
          >
            Create PR
          </Button>
          {selectedPath && (
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
      <AlertDialog open={prDialogOpen} onOpenChange={setPrDialogOpen}>
        <AlertDialogContent size="md">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle>Create Pull Request</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs text-zinc-400">PR name</p>
              <Input
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                placeholder="Short PR title"
                disabled={isCreatingPr}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-zinc-400">Message (markdown)</p>
              <Textarea
                value={prMessage}
                onChange={(e) => setPrMessage(e.target.value)}
                placeholder="## Summary&#10;- What changed&#10;&#10;## Test plan&#10;- ..."
                className="min-h-36"
                disabled={isCreatingPr}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-zinc-400">
                Includes all modified files ({modifiedCount}):
              </p>
              <div className="max-h-40 overflow-auto rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1">
                {modifiedFileList.length > 0 ? (
                  <ul className="space-y-0.5">
                    {modifiedFileList.map((path) => (
                      <li key={path} className="font-mono text-[11px] text-zinc-300">
                        {path}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-zinc-500">No modified files found.</p>
                )}
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrDialogOpen(false)}
              disabled={isCreatingPr}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={createPr}
              disabled={isCreatingPr || modifiedCount === 0}
            >
              {isCreatingPr ? "Creating..." : "Create PR"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 min-h-0 w-full min-w-0"
        autoSave="repo-sidebar-v3"
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
                <p className="text-xs text-zinc-500">
                  {isDirty ? "Unsaved changes" : "All changes saved"}
                </p>
              </div>
              <div className="overflow-hidden rounded border border-zinc-800">
                <ActiveEditor
                  value={editorValue}
                  onChange={(value) => handleEditorChange(value)}
                />
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
