import { useCallback, useEffect, useMemo } from "react";
import { useLocation, NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { FileTree, type FileStatus } from "@/components/code/file-tree";
import { useSetupStore } from "@/stores/setup";
import { useCodeStore } from "@/stores/code";

function parseSelectedPathFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/code\/[^/]+\/[^/]+\/(.+)$/);
  return match ? match[1] : null;
}

export function SidebarCodeSection() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  const repoOwner = useSetupStore((s) => s.status?.repo?.owner);
  const repoName = useSetupStore((s) => s.status?.repo?.repo);
  const repo = repoOwner && repoName ? { owner: repoOwner, repo: repoName } : null;

  const entries = useCodeStore((s) => s.entries);
  const modifiedPaths = useCodeStore((s) => s.modifiedPaths);
  const untrackedPaths = useCodeStore((s) => s.untrackedPaths);
  const loading = useCodeStore((s) => s.loading);
  const loadTree = useCodeStore((s) => s.loadTree);

  useEffect(() => {
    if (repoOwner && repoName) {
      void loadTree();
    }
  }, [repoOwner, repoName, loadTree]);

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

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border border-transparent">
        <NavLink
          to={codeHref}
          className={({ isActive }) =>
            cn(
              "text-[11px] uppercase tracking-wide",
              isActive || pathname.startsWith("/code")
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            )
          }
        >
          Code
        </NavLink>
      </div>
      <div className="space-y-1 pl-3">
        {!repo ? (
          <p className="px-3 py-1 text-[10px] text-zinc-500">No repo</p>
        ) : loading ? (
          <p className="px-3 py-1 text-[10px] text-zinc-500">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="px-3 py-1 text-[10px] text-zinc-500">No files</p>
        ) : (
          <FileTree
            entries={entries}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            fileStatuses={fileStatuses}
            compact
          />
        )}
      </div>
    </div>
  );
}
