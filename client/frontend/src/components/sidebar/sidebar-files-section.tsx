import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FilePlus, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import {
  FileTree,
  type FileStatus,
  type PendingInput,
} from "@/components/files/file-tree";
import { useSetupStore } from "@/stores/setup";
import { useCodeTree, useGitStatuses } from "@/hooks/queries";
import { invalidateResource } from "@/lib/queryClient";
import { apiDelete, apiPatch, apiPost, toastApiError } from "@/lib/api";

function parseSelectedPathFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/files\/[^/]+\/[^/]+\/(.+)$/);
  return match ? match[1] : null;
}

function invalidateFilesQueries() {
  invalidateResource("filesTree", "filesStatuses");
}

export function SidebarFilesSection() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  const repoOwner = useSetupStore((s) => s.status?.repo?.owner);
  const repoName = useSetupStore((s) => s.status?.repo?.repo);
  const repo = useMemo(
    () => (repoOwner && repoName ? { owner: repoOwner, repo: repoName } : null),
    [repoOwner, repoName],
  );

  const { data: entries = [], isLoading: loading } = useCodeTree();
  const { data: gitData } = useGitStatuses();

  const [pendingInput, setPendingInput] = useState<PendingInput | null>(null);

  const selectedPath = useMemo(
    () => parseSelectedPathFromPathname(pathname),
    [pathname],
  );

  const fileStatuses = useMemo<Record<string, FileStatus>>(() => {
    const modifiedPaths = gitData?.modifiedPaths ?? {};
    const untrackedPaths = gitData?.untrackedPaths ?? {};
    const statuses: Record<string, FileStatus> = {};
    for (const path of Object.keys(modifiedPaths)) {
      statuses[path] = "modified";
    }
    for (const path of Object.keys(untrackedPaths)) {
      statuses[path] = "untracked";
    }
    return statuses;
  }, [gitData?.modifiedPaths, gitData?.untrackedPaths]);

  const filesHref = repo ? `/files/${repo.owner}/${repo.repo}` : "/files";

  const onSelectFile = useCallback(
    (path: string) => {
      if (!repo) return;
      navigate(`/files/${repo.owner}/${repo.repo}/${path}`);
    },
    [navigate, repo],
  );

  const onDeleteFile = useCallback(
    async (path: string) => {
      if (!repo) return;
      if (!window.confirm(`Delete ${path}?`)) return;
      try {
        await apiDelete(`/files/file?path=${encodeURIComponent(path)}`);
        invalidateFilesQueries();
        if (selectedPath === path) {
          navigate(filesHref);
        }
        toast.success("File deleted");
      } catch (error) {
        toastApiError(error, "Failed to delete file");
      }
    },
    [repo, selectedPath, filesHref, navigate],
  );

  const handleCreateInDir = useCallback(
    (parentPath: string, type: "file" | "dir") => {
      setPendingInput({ parentPath, type });
    },
    [],
  );

  const handleCommit = useCallback(
    async (name: string) => {
      if (!pendingInput || !repo) return;
      if (!name) {
        setPendingInput(null);
        return;
      }
      const fullPath = pendingInput.parentPath
        ? `${pendingInput.parentPath}/${name}`
        : name;
      setPendingInput(null);
      try {
        if (pendingInput.type === "file") {
          await apiPost("/files/file", { path: fullPath, content: "" });
          invalidateFilesQueries();
          navigate(`/files/${repo.owner}/${repo.repo}/${fullPath}`);
          toast.success("File created");
        } else {
          await apiPost("/files/folder", { path: fullPath });
          invalidateFilesQueries();
          toast.success("Folder created");
        }
      } catch (error) {
        toastApiError(error, "Failed to create");
      }
    },
    [pendingInput, repo, navigate],
  );

  const handleDeleteDir = useCallback(
    async (path: string) => {
      if (!repo) return;
      if (!window.confirm(`Delete folder "${path}" and all its contents?`))
        return;
      try {
        await apiDelete(`/files/folder?path=${encodeURIComponent(path)}`);
        invalidateFilesQueries();
        toast.success("Folder deleted");
      } catch (error) {
        toastApiError(error, "Failed to delete folder");
      }
    },
    [repo],
  );

  const handleMove = useCallback(
    async (src: string, destDir: string) => {
      if (!repo) return;
      const basename = src.split("/").pop()!;
      const dest = destDir ? `${destDir}/${basename}` : basename;
      if (dest === src) return;
      try {
        await apiPatch("/files/move", { src, dest });
        invalidateFilesQueries();
        if (selectedPath === src) {
          navigate(`/files/${repo.owner}/${repo.repo}/${dest}`);
        }
        toast.success("Moved");
      } catch (error) {
        toastApiError(error, "Failed to move");
      }
    },
    [repo, selectedPath, navigate],
  );

  return (
    <div className="space-y-2">
      {repo && (
        <div className="flex items-center justify-end gap-0.5 px-2">
          <button
            type="button"
            onClick={() => handleCreateInDir("", "file")}
            className="text-zinc-500 hover:text-zinc-100 p-0.5"
            title="New file"
            aria-label="New file"
          >
            <FilePlus className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => handleCreateInDir("", "dir")}
            className="text-zinc-500 hover:text-zinc-100 p-0.5"
            title="New folder"
            aria-label="New folder"
          >
            <FolderPlus className="size-3" />
          </button>
        </div>
      )}
      <div className="space-y-1 px-2">
        {!repo ? (
          <p className="py-1 text-[10px] text-zinc-500">No repo</p>
        ) : loading ? (
          <p className="py-1 text-[10px] text-zinc-500">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="py-1 text-[10px] text-zinc-500">No files</p>
        ) : (
          <FileTree
            entries={entries}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            onDeleteFile={onDeleteFile}
            fileStatuses={fileStatuses}
            compact
            pendingInput={pendingInput}
            onCommit={handleCommit}
            onCancelInput={() => setPendingInput(null)}
            onCreateInDir={handleCreateInDir}
            onDeleteDir={handleDeleteDir}
            onMove={handleMove}
          />
        )}
      </div>
    </div>
  );
}
