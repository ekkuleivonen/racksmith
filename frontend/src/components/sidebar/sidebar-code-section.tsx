import { useCallback, useMemo, useState } from "react";
import { useLocation, NavLink, useNavigate } from "react-router-dom";
import { Code2, FilePlus, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FileTree,
  type FileStatus,
  type PendingInput,
} from "@/components/code/file-tree";
import { useSetupStore } from "@/stores/setup";
import { useCodeTree, useGitStatuses } from "@/hooks/queries";
import { queryClient, queryKeys } from "@/lib/queryClient";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";

function parseSelectedPathFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/code\/[^/]+\/[^/]+\/(.+)$/);
  return match ? match[1] : null;
}

function invalidateCodeQueries() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.codeTree });
  void queryClient.invalidateQueries({ queryKey: queryKeys.codeStatuses });
}

export function SidebarCodeSection() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  const repoOwner = useSetupStore((s) => s.status?.repo?.owner);
  const repoName = useSetupStore((s) => s.status?.repo?.repo);
  const repo = repoOwner && repoName ? { owner: repoOwner, repo: repoName } : null;

  const { data: entries = [], isLoading: loading } = useCodeTree();
  const { data: gitData } = useGitStatuses();
  const modifiedPaths = gitData?.modifiedPaths ?? {};
  const untrackedPaths = gitData?.untrackedPaths ?? {};

  const [pendingInput, setPendingInput] = useState<PendingInput | null>(null);

  const selectedPath = useMemo(
    () => parseSelectedPathFromPathname(pathname),
    [pathname],
  );

  const fileStatuses = useMemo<Record<string, FileStatus>>(() => {
    const statuses: Record<string, FileStatus> = {};
    for (const path of Object.keys(modifiedPaths)) {
      statuses[path] = "modified";
    }
    for (const path of Object.keys(untrackedPaths)) {
      statuses[path] = "untracked";
    }
    return statuses;
  }, [modifiedPaths, untrackedPaths]);

  const codeHref = repo ? `/code/${repo.owner}/${repo.repo}` : "/code";

  const onSelectFile = useCallback(
    (path: string) => {
      if (!repo) return;
      navigate(`/code/${repo.owner}/${repo.repo}/${path}`);
    },
    [navigate, repo],
  );

  const onDeleteFile = useCallback(
    async (path: string) => {
      if (!repo) return;
      if (!window.confirm(`Delete ${path}?`)) return;
      try {
        await apiDelete(`/code/file?path=${encodeURIComponent(path)}`);
        invalidateCodeQueries();
        if (selectedPath === path) {
          navigate(codeHref);
        }
        toast.success("File deleted");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete file",
        );
      }
    },
    [repo, selectedPath, codeHref, navigate],
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
          await apiPost("/code/file", { path: fullPath, content: "" });
          invalidateCodeQueries();
          navigate(`/code/${repo.owner}/${repo.repo}/${fullPath}`);
          toast.success("File created");
        } else {
          await apiPost("/code/folder", { path: fullPath });
          invalidateCodeQueries();
          toast.success("Folder created");
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to create",
        );
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
        await apiDelete(`/code/folder?path=${encodeURIComponent(path)}`);
        invalidateCodeQueries();
        toast.success("Folder deleted");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete folder",
        );
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
        await apiPatch("/code/move", { src, dest });
        invalidateCodeQueries();
        if (selectedPath === src) {
          navigate(`/code/${repo.owner}/${repo.repo}/${dest}`);
        }
        toast.success("Moved");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to move",
        );
      }
    },
    [repo, selectedPath, navigate],
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border border-transparent">
        <NavLink
          to={codeHref}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
              isActive || pathname.startsWith("/code")
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
          <Code2 className="size-3 shrink-0" />
          Code
        </NavLink>
        {repo && (
          <div className="flex items-center gap-0.5">
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
      </div>
      <div className="space-y-1 pl-2">
        {!repo ? (
          <p className="px-2 py-1 text-[10px] text-zinc-500">No repo</p>
        ) : loading ? (
          <p className="px-2 py-1 text-[10px] text-zinc-500">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="px-2 py-1 text-[10px] text-zinc-500">No files</p>
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
