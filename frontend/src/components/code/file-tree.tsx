import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type TreeEntry = {
  name: string;
  type: "dir" | "file";
  children?: TreeEntry[];
};

export type FileStatus = "default" | "modified" | "untracked";

export type PendingInput = {
  parentPath: string;
  type: "file" | "dir";
};

type FileTreeProps = {
  entries: TreeEntry[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  fileStatuses?: Record<string, FileStatus>;
  basePath?: string;
  compact?: boolean;
  pendingInput?: PendingInput | null;
  onCommit?: (name: string) => void;
  onCancelInput?: () => void;
  onCreateInDir?: (parentPath: string, type: "file" | "dir") => void;
  onDeleteDir?: (path: string) => void;
};

function TreeItem({
  entry,
  selectedPath,
  onSelectFile,
  onDeleteFile,
  fileStatuses,
  basePath = "",
  compact = false,
  pendingInput,
  onCommit,
  onCancelInput,
  onCreateInDir,
  onDeleteDir,
}: {
  entry: TreeEntry;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  fileStatuses?: Record<string, FileStatus>;
  basePath: string;
  compact?: boolean;
  pendingInput?: PendingInput | null;
  onCommit?: (name: string) => void;
  onCancelInput?: () => void;
  onCreateInDir?: (parentPath: string, type: "file" | "dir") => void;
  onDeleteDir?: (path: string) => void;
}) {
  const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pendingInput?.parentPath === fullPath) setOpen(true);
  }, [pendingInput, fullPath]);

  const hasChanges = (() => {
    const hasChangesInEntry = (node: TreeEntry, currentPath: string): boolean => {
      if (node.type === "file") {
        const status = fileStatuses?.[currentPath] ?? "default";
        return status === "modified" || status === "untracked";
      }
      if (!node.children || node.children.length === 0) return false;
      return node.children.some((child) =>
        hasChangesInEntry(child, `${currentPath}/${child.name}`)
      );
    };
    return hasChangesInEntry(entry, fullPath);
  })();

  if (entry.type === "dir") {
    const hasChildren = entry.children && entry.children.length > 0;
    const showInput = pendingInput?.parentPath === fullPath;
    const showChildren = open || showInput;

    const dirButton = (
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 w-full text-left text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300 rounded",
          compact ? "py-0.5 px-1.5 text-xs" : "py-1 px-2 text-sm"
        )}
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
        {hasChanges && (
          <span
            className="ml-auto inline-flex size-2 rounded-full bg-amber-400/90"
            title="Contains modified or untracked files"
            aria-label="Contains modified or untracked files"
          />
        )}
      </button>
    );

    const dirContent = (
      <div className="select-none">
        {onCreateInDir || onDeleteDir ? (
          <ContextMenu>
            <ContextMenuTrigger asChild>{dirButton}</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onCreateInDir?.(fullPath, "file")}>
                <FilePlus />
                New file
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onCreateInDir?.(fullPath, "dir")}>
                <FolderPlus />
                New folder
              </ContextMenuItem>
              {onDeleteDir && (
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => onDeleteDir(fullPath)}
                >
                  <Trash2 />
                  Delete folder
                </ContextMenuItem>
              )}
            </ContextMenuContent>
          </ContextMenu>
        ) : (
          dirButton
        )}
        {showChildren && (
          <div className={cn("border-l border-zinc-800 ml-2 mt-0.5", compact ? "pl-2" : "pl-4")}>
            {hasChildren &&
              entry.children!.map((child) => (
                <TreeItem
                  key={child.name}
                  entry={child}
                  selectedPath={selectedPath}
                  onSelectFile={onSelectFile}
                  onDeleteFile={onDeleteFile}
                  fileStatuses={fileStatuses}
                  basePath={fullPath}
                  compact={compact}
                  pendingInput={pendingInput}
                  onCommit={onCommit}
                  onCancelInput={onCancelInput}
                  onCreateInDir={onCreateInDir}
                  onDeleteDir={onDeleteDir}
                />
              ))}
            {showInput && onCommit && onCancelInput && pendingInput && (
              <div className={cn("flex items-center gap-1.5 py-0.5 px-1.5", compact ? "text-xs" : "text-sm")}>
                <span className="size-3.5 shrink-0" />
                {pendingInput.type === "dir" ? (
                  <Folder className="size-4 shrink-0 text-amber-500/80" />
                ) : (
                  <File className="size-4 shrink-0 text-zinc-500" />
                )}
                <input
                  autoFocus
                  className="flex-1 min-w-0 bg-transparent text-xs text-zinc-100 outline-none border-b border-zinc-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onCommit(e.currentTarget.value.trim());
                    if (e.key === "Escape") onCancelInput();
                  }}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim();
                    if (v) onCommit(v);
                    else onCancelInput();
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );

    return dirContent;
  }

  const isSelected = selectedPath === fullPath;
  const status = fileStatuses?.[fullPath] ?? "default";
  const fileButton = (
    <button
      type="button"
      onClick={() => onSelectFile(fullPath)}
      className={cn(
        "flex items-center gap-1.5 w-full text-left rounded",
        compact ? "py-0.5 px-1.5 text-xs" : "py-1 px-2 text-sm",
        isSelected
          ? "bg-zinc-700 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
      )}
    >
      <span className="size-3.5 shrink-0" />
      <File className="size-4 shrink-0 text-zinc-500" />
      <span className="truncate flex-1 min-w-0">{entry.name}</span>
      {status === "modified" && (
        <span
          className={cn(
            "inline-flex h-4 min-w-4 items-center justify-center rounded text-[10px] font-medium px-1",
            "text-amber-300"
          )}
          title="Modified file"
          aria-label="Modified file"
        >
          M
        </span>
      )}
      {status === "untracked" && (
        <span
          className={cn(
            "inline-flex h-4 min-w-4 items-center justify-center rounded text-[10px] font-medium px-1",
            "text-zinc-400"
          )}
          title="Untracked file"
          aria-label="Untracked file"
        >
          U
        </span>
      )}
    </button>
  );

  if (onDeleteFile) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{fileButton}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            variant="destructive"
            onClick={() => onDeleteFile(fullPath)}
          >
            <Trash2 />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return fileButton;
}

function InlineInput({
  type,
  onCommit,
  onCancelInput,
  compact,
}: {
  type: "file" | "dir";
  onCommit: (name: string) => void;
  onCancelInput: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 py-0.5 px-1.5",
        compact ? "text-xs" : "text-sm",
      )}
    >
      <span className="size-3.5 shrink-0" />
      {type === "dir" ? (
        <Folder className="size-4 shrink-0 text-amber-500/80" />
      ) : (
        <File className="size-4 shrink-0 text-zinc-500" />
      )}
      <input
        autoFocus
        className="flex-1 min-w-0 bg-transparent text-xs text-zinc-100 outline-none border-b border-zinc-500"
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(e.currentTarget.value.trim());
          if (e.key === "Escape") onCancelInput();
        }}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          if (v) onCommit(v);
          else onCancelInput();
        }}
      />
    </div>
  );
}

export function FileTree({
  entries,
  selectedPath,
  onSelectFile,
  onDeleteFile,
  fileStatuses,
  basePath = "",
  compact = false,
  pendingInput,
  onCommit,
  onCancelInput,
  onCreateInDir,
  onDeleteDir,
}: FileTreeProps) {
  const showRootInput = pendingInput?.parentPath === "";
  const treeContent = (
    <div className={cn("border-l border-zinc-800", basePath ? "ml-2 pl-2" : "pl-0", compact ? "pl-2" : "")}>
      {entries.map((entry) => (
        <TreeItem
          key={basePath ? `${basePath}/${entry.name}` : entry.name}
          entry={entry}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          onDeleteFile={onDeleteFile}
          fileStatuses={fileStatuses}
          basePath={basePath}
          compact={compact}
          pendingInput={pendingInput}
          onCommit={onCommit}
          onCancelInput={onCancelInput}
          onCreateInDir={onCreateInDir}
          onDeleteDir={onDeleteDir}
        />
      ))}
      {showRootInput && onCommit && onCancelInput && pendingInput && (
        <InlineInput
          type={pendingInput.type}
          onCommit={onCommit}
          onCancelInput={onCancelInput}
          compact={compact}
        />
      )}
    </div>
  );

  const wrappedContent =
    onCreateInDir && !basePath ? (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className={compact ? "py-0.5" : "py-1"}>{treeContent}</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onCreateInDir("", "file")}>
            <FilePlus />
            New file
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onCreateInDir("", "dir")}>
            <FolderPlus />
            New folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    ) : (
      <div className={compact ? "py-0.5" : "py-1"}>{treeContent}</div>
    );

  return wrappedContent;
}
