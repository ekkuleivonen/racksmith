import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export type TreeEntry = {
  name: string;
  type: "dir" | "file";
  children?: TreeEntry[];
};

export type FileStatus = "default" | "saved";

type FileTreeProps = {
  entries: TreeEntry[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  fileStatuses?: Record<string, FileStatus>;
  basePath?: string;
};

function TreeItem({
  entry,
  selectedPath,
  onSelectFile,
  fileStatuses,
  basePath = "",
}: {
  entry: TreeEntry;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  fileStatuses?: Record<string, FileStatus>;
  basePath: string;
}) {
  const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name;
  const [open, setOpen] = useState(false);
  const hasSavedFiles = (() => {
    const hasSavedInEntry = (node: TreeEntry, currentPath: string): boolean => {
      if (node.type === "file") {
        return (fileStatuses?.[currentPath] ?? "default") === "saved";
      }
      if (!node.children || node.children.length === 0) return false;
      return node.children.some((child) =>
        hasSavedInEntry(child, `${currentPath}/${child.name}`)
      );
    };
    return hasSavedInEntry(entry, fullPath);
  })();

  if (entry.type === "dir") {
    const hasChildren = entry.children && entry.children.length > 0;
    return (
      <div className="select-none">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 py-1 px-2 w-full text-left text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300 rounded"
        >
          {hasChildren ? (
            open ? (
              <ChevronDown className="size-3.5 shrink-0" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0" />
            )
          ) : (
            <span className="size-3.5 shrink-0" />
          )}
          {open ? (
            <FolderOpen className="size-4 shrink-0 text-amber-500/80" />
          ) : (
            <Folder className="size-4 shrink-0 text-amber-500/80" />
          )}
          <span className="truncate">{entry.name}</span>
          {hasSavedFiles && (
            <span
              className="ml-auto inline-flex size-2 rounded-full bg-amber-400/90"
              title="Contains saved edits"
              aria-label="Contains saved edits"
            />
          )}
        </button>
        {open && hasChildren && (
          <div className="pl-4 border-l border-zinc-800 ml-2 mt-0.5">
            {entry.children!.map((child) => (
              <TreeItem
                key={child.name}
                entry={child}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
                fileStatuses={fileStatuses}
                basePath={fullPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedPath === fullPath;
  const status = fileStatuses?.[fullPath] ?? "default";
  return (
    <button
      type="button"
      onClick={() => onSelectFile(fullPath)}
      className={cn(
        "flex items-center gap-1.5 py-1 px-2 w-full text-left text-sm rounded",
        isSelected
          ? "bg-zinc-700 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
      )}
    >
      <span className="size-3.5 shrink-0" />
      <File className="size-4 shrink-0 text-zinc-500" />
      <span className="truncate flex-1 min-w-0">{entry.name}</span>
      {status === "saved" && (
        <span
          className={cn(
            "inline-flex h-4 min-w-4 items-center justify-center rounded text-[10px] font-medium px-1",
            "text-amber-300"
          )}
          title="Saved edit"
          aria-label="Saved edit"
        >
          M
        </span>
      )}
    </button>
  );
}

export function FileTree({
  entries,
  selectedPath,
  onSelectFile,
  fileStatuses,
  basePath = "",
}: FileTreeProps) {
  return (
    <div className="py-1">
      {entries.map((entry) => (
        <TreeItem
          key={basePath ? `${basePath}/${entry.name}` : entry.name}
          entry={entry}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          fileStatuses={fileStatuses}
          basePath={basePath}
        />
      ))}
    </div>
  );
}
