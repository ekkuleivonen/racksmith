import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
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
  onMove?: (srcPath: string, destDirPath: string) => void;
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
  onMove,
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
  onMove?: (srcPath: string, destDirPath: string) => void;
}) {
  const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name;
  const depth = basePath ? basePath.split("/").filter(Boolean).length : 0;
  const [open, setOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `drag:${fullPath}`,
    data: { path: fullPath, type: entry.type },
    activationConstraint: { distance: 8 },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: entry.type === "dir" ? `drop:${fullPath}` : `drop:file:${fullPath}`,
    data: { path: fullPath, type: entry.type },
  });

  useEffect(() => {
    if (pendingInput?.parentPath === fullPath) setOpen(true);
  }, [pendingInput, fullPath]);

  const { hasChanges, hasUntracked } = (() => {
    const hasChangesInEntry = (
      node: TreeEntry,
      currentPath: string,
    ): boolean => {
      if (node.type === "file") {
        const status = fileStatuses?.[currentPath] ?? "default";
        return status === "modified" || status === "untracked";
      }
      if (!node.children || node.children.length === 0) return false;
      return node.children.some((child) =>
        hasChangesInEntry(child, `${currentPath}/${child.name}`),
      );
    };
    const hasUntrackedInEntry = (
      node: TreeEntry,
      currentPath: string,
    ): boolean => {
      if (node.type === "file") {
        return fileStatuses?.[currentPath] === "untracked";
      }
      if (!node.children || node.children.length === 0) return false;
      return node.children.some((child) =>
        hasUntrackedInEntry(child, `${currentPath}/${child.name}`),
      );
    };
    return {
      hasChanges: hasChangesInEntry(entry, fullPath),
      hasUntracked: hasUntrackedInEntry(entry, fullPath),
    };
  })();

  if (entry.type === "dir") {
    const hasChildren = entry.children && entry.children.length > 0;
    const showInput = pendingInput?.parentPath === fullPath;
    const showChildren = open || showInput;

    const indentPx = depth * (compact ? 8 : 16);
    const dirRow = (
      <div
        className={cn(
          "grid w-full gap-x-1.5 text-left text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300 rounded items-center",
          compact ? "py-0.5 px-1.5 text-xs" : "py-1 px-2 text-sm",
          isOver && "bg-zinc-700/60 outline outline-1 outline-zinc-500",
        )}
        style={{
          gridTemplateColumns: "auto auto minmax(0, 1fr) 16px",
          paddingLeft: indentPx,
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-zinc-700/50"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {hasChildren ? (
            open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )
          ) : (
            <span className="size-3.5 block" />
          )}
        </button>
        <div
          ref={setDragRef}
          {...listeners}
          {...attributes}
          style={{ opacity: isDragging ? 0.4 : undefined }}
          className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-zinc-700/50 cursor-grab active:cursor-grabbing min-w-0"
        >
          {open ? (
            <FolderOpen className="size-3.5 text-zinc-500" />
          ) : (
            <Folder className="size-3.5 text-zinc-500" />
          )}
        </div>
        <span className="truncate min-w-0">{entry.name}</span>
        <span
          className="flex shrink-0 items-center justify-end"
          title={
            hasChanges
              ? hasUntracked
                ? "Contains untracked files"
                : "Contains modified files"
              : undefined
          }
          aria-label={
            hasChanges
              ? hasUntracked
                ? "Contains untracked files"
                : "Contains modified files"
              : undefined
          }
        >
          {hasChanges && (
            <span
              className={cn(
                "inline-flex size-1.5 rounded-full opacity-75",
                hasUntracked ? "bg-green-600" : "bg-amber-400",
              )}
            />
          )}
        </span>
      </div>
    );

    const dirContent = (
      <div ref={setDropRef} className="select-none">
        {onCreateInDir || onDeleteDir ? (
          <ContextMenu>
            <ContextMenuTrigger asChild>{dirRow}</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onClick={() => onCreateInDir?.(fullPath, "file")}
              >
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
          dirRow
        )}
        {showChildren && (
          <div
            className={cn(
              "border-l border-zinc-800 ml-2 mt-0.5",
              compact ? "pl-2" : "pl-4",
            )}
          >
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
                  onMove={onMove}
                />
              ))}
            {showInput && onCommit && onCancelInput && pendingInput && (
              <div
                className={cn(
                  "flex items-center gap-1.5 py-0.5 px-1.5",
                  compact ? "text-xs" : "text-sm",
                )}
              >
                <span className="size-3.5 shrink-0" />
                {pendingInput.type === "dir" ? (
                  <Folder className="size-3.5 shrink-0 text-zinc-500" />
                ) : (
                  <File className="size-3.5 shrink-0 text-zinc-500" />
                )}
                <input
                  autoFocus
                  className="flex-1 min-w-0 bg-transparent text-xs text-zinc-100 outline-none border-b border-zinc-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      onCommit(e.currentTarget.value.trim());
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
  const indentPx = depth * (compact ? 8 : 16);
  const fileRow = (
    <div
      className={cn(
        "grid w-full gap-x-1.5 text-left rounded items-center",
        compact ? "py-0.5 px-1.5 text-xs" : "py-1 px-2 text-sm",
        isSelected
          ? "bg-zinc-700 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300",
      )}
      style={{
        gridTemplateColumns: "auto auto minmax(0, 1fr) 16px",
        paddingLeft: indentPx,
      }}
    >
      <span className="size-3.5 shrink-0" aria-hidden />
      <div
        ref={setDragRef}
        {...listeners}
        {...attributes}
        style={{ opacity: isDragging ? 0.4 : undefined }}
        className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-zinc-700/50 cursor-grab active:cursor-grabbing"
        aria-label="Drag to move"
      >
        <File className="size-3.5 text-zinc-500" />
      </div>
      <button
        type="button"
        onClick={() => onSelectFile(fullPath)}
        className={cn(
          "min-w-0 text-left rounded truncate",
          isSelected ? "text-zinc-100" : "text-inherit",
        )}
      >
        {entry.name}
      </button>
      <span
        className="flex shrink-0 items-center justify-end"
        title={status === "modified" ? "Modified file" : status === "untracked" ? "Untracked file" : undefined}
        aria-label={status === "modified" ? "Modified file" : status === "untracked" ? "Untracked file" : undefined}
      >
        {status === "modified" && (
          <span
            className={cn(
              "inline leading-none text-[8px] font-medium tracking-tighter",
              "text-amber-300 opacity-75",
            )}
          >
            M
          </span>
        )}
        {status === "untracked" && (
          <span
            className={cn(
              "inline leading-none text-[8px] font-medium tracking-tighter",
              "text-green-600 opacity-75",
            )}
          >
            U
          </span>
        )}
      </span>
    </div>
  );

  if (onDeleteFile) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{fileRow}</ContextMenuTrigger>
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

  return fileRow;
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
        <Folder className="size-3.5 shrink-0 text-zinc-500" />
      ) : (
        <File className="size-3.5 shrink-0 text-zinc-500" />
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
  onMove,
}: FileTreeProps) {
  const showRootInput = pendingInput?.parentPath === "";
  const { setNodeRef: setRootDropRef, isOver: isRootOver } = useDroppable({
    id: "drop:root",
    data: { path: "", type: "dir" as const },
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !onMove) return;
      const src = active.data.current?.path as string | undefined;
      const destDir = over.data.current?.path as string | undefined;
      if (src == null || destDir === undefined) return;
      if (destDir === src || destDir.startsWith(src + "/")) return;
      const currentDir = src.includes("/")
        ? src.slice(0, src.lastIndexOf("/"))
        : "";
      if (destDir === currentDir) return;
      if (over.data.current?.type === "file") return;
      onMove(src, destDir);
    },
    [onMove],
  );

  const treeContent = (
    <div
      ref={setRootDropRef}
      className={cn(
        "border-l border-zinc-800",
        basePath ? "ml-2 pl-2" : "pl-0",
        compact ? "pl-2" : "",
        isRootOver && "ring-1 ring-inset ring-zinc-500 rounded",
      )}
    >
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
          onMove={onMove}
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

  return <DndContext onDragEnd={handleDragEnd}>{wrappedContent}</DndContext>;
}
