import { useCallback, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Pencil,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type FolderNode<T> = {
  name: string;
  path: string;
  children: FolderNode<T>[];
  items: T[];
};

export type SidebarFolderTreeProps<T> = {
  items: T[];
  itemKey: (item: T) => string;
  itemPath: (item: T) => string;
  itemLabel: (item: T) => string;
  itemFolder: (item: T) => string;
  onMoveToFolder: (itemKey: string, folder: string) => void;
  onToggleStar?: (itemPath: string, itemLabel: string) => void;
  isStarred?: (itemPath: string) => boolean;
  storageKey: string;
};

const STORAGE_PREFIX = "racksmith-folder-expanded:";

function loadExpanded(storageKey: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveExpanded(storageKey: string, state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function buildTree<T>(
  items: T[],
  itemFolder: (item: T) => string,
  itemLabel: (item: T) => string,
  emptyFolders: string[] = [],
): FolderNode<T> {
  const root: FolderNode<T> = { name: "", path: "", children: [], items: [] };
  const folders = new Map<string, FolderNode<T>>();
  folders.set("", root);

  function ensureFolder(folderPath: string): FolderNode<T> {
    if (folders.has(folderPath)) return folders.get(folderPath)!;
    const parts = folderPath.split("/");
    const parentPath = parts.slice(0, -1).join("/");
    const parent = ensureFolder(parentPath);
    const node: FolderNode<T> = {
      name: parts[parts.length - 1],
      path: folderPath,
      children: [],
      items: [],
    };
    parent.children.push(node);
    folders.set(folderPath, node);
    return node;
  }

  for (const f of emptyFolders) {
    ensureFolder(f);
  }

  for (const item of items) {
    const f = itemFolder(item).replace(/^\/|\/$/g, "");
    if (f) {
      const node = ensureFolder(f);
      node.items.push(item);
    } else {
      root.items.push(item);
    }
  }

  function sortNode(node: FolderNode<T>) {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.items.sort((a, b) => itemLabel(a).localeCompare(itemLabel(b)));
    for (const child of node.children) sortNode(child);
  }
  sortNode(root);

  return root;
}

function folderRenameCollides<T>(
  oldPath: string,
  newPath: string,
  items: T[],
  itemFolder: (item: T) => string,
  emptyFolderPaths: string[],
): boolean {
  const underOld = (p: string) => p === oldPath || p.startsWith(oldPath + "/");
  const usesNew = (p: string) => p === newPath || p.startsWith(newPath + "/");
  const paths = new Set<string>();
  for (const item of items) {
    const f = itemFolder(item).replace(/^\/|\/$/g, "");
    if (f) paths.add(f);
  }
  for (const ef of emptyFolderPaths) {
    const f = ef.replace(/^\/|\/$/g, "");
    if (f) paths.add(f);
  }
  for (const p of paths) {
    if (usesNew(p) && !underOld(p)) return true;
  }
  return false;
}

function RenameFolderInput({
  initialName,
  onCommit,
  onCancel,
}: {
  initialName: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <input
      autoFocus
      defaultValue={initialName}
      className="flex-1 min-w-0 bg-transparent text-[11px] text-zinc-100 outline-none border-b border-zinc-500"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const v = e.currentTarget.value.trim();
          if (v) onCommit(v);
          else onCancel();
        }
        if (e.key === "Escape") onCancel();
      }}
      onBlur={(e) => {
        const v = e.currentTarget.value.trim();
        if (v) onCommit(v);
        else onCancel();
      }}
    />
  );
}

function DraggableItem<T>({
  item,
  itemKey,
  itemPath,
  itemLabel,
  onToggleStar,
  isStarred,
  onNewFolder,
}: {
  item: T;
  itemKey: (item: T) => string;
  itemPath: (item: T) => string;
  itemLabel: (item: T) => string;
  onToggleStar?: (itemPath: string, itemLabel: string) => void;
  isStarred?: (itemPath: string) => boolean;
  onNewFolder?: () => void;
}) {
  const { pathname } = useLocation();
  const key = itemKey(item);
  const path = itemPath(item);
  const label = itemLabel(item);
  const starred = isStarred?.(path) ?? false;

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({ id: key, data: { key, label } });

  const inner = (
    <div
      ref={setNodeRef}
      className="group/item flex items-center"
      style={{ opacity: isDragging ? 0.3 : undefined }}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab opacity-0 group-hover/item:opacity-100 text-zinc-600 hover:text-zinc-400 transition-opacity touch-none"
        aria-label="Drag to reorder"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="size-3" />
      </button>
      <NavLink
        to={path}
        className={cn(
          "flex-1 flex items-center gap-1.5 rounded py-0.5 px-1.5 text-[11px] no-underline truncate min-w-0",
          pathname === path
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300",
        )}
      >
        <span className="truncate">{label}</span>
      </NavLink>
    </div>
  );

  if (!onToggleStar && !onNewFolder) return inner;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {inner}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {onToggleStar && (
          <ContextMenuItem onClick={() => onToggleStar(path, label)}>
            <Star className={cn("size-3.5", starred && "fill-yellow-400 text-yellow-400")} />
            {starred ? "Unstar" : "Star"}
          </ContextMenuItem>
        )}
        {onNewFolder && (
          <ContextMenuItem onClick={onNewFolder}>
            <FolderPlus className="size-3.5" />
            New folder
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function DroppableFolder<T>({
  node,
  expanded,
  onToggle,
  itemKey,
  itemPath,
  itemLabel,
  onToggleStar,
  isStarred,
  onNewFolder,
  renamingPath,
  onRequestRename,
  onRenameCommit,
  onRenameCancel,
  depth,
}: {
  node: FolderNode<T>;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
  itemKey: (item: T) => string;
  itemPath: (item: T) => string;
  itemLabel: (item: T) => string;
  onToggleStar?: (itemPath: string, itemLabel: string) => void;
  isStarred?: (itemPath: string) => boolean;
  onNewFolder?: () => void;
  renamingPath: string | null;
  onRequestRename: (path: string) => void;
  onRenameCommit: (oldPath: string, name: string) => void;
  onRenameCancel: () => void;
  depth: number;
}) {
  const isOpen = expanded[node.path] ?? false;
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `folder:${node.path}`,
    data: { folder: node.path },
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `dragfolder:${node.path}`,
    data: { folderPath: node.path, label: node.name },
  });
  const hasContent = node.children.length > 0 || node.items.length > 0;
  const isRenaming = renamingPath === node.path;

  const rowPaddingLeft = depth * 8;
  const rowClass = cn(
    "flex flex-1 items-center gap-1 rounded py-0.5 px-1.5 text-[11px] text-zinc-500 min-w-0",
    !isRenaming && "hover:bg-zinc-800/50 hover:text-zinc-300 transition-colors",
    isOver && "bg-zinc-700/60 ring-1 ring-zinc-500",
  );

  const folderIcons = (
    <>
      {hasContent ? (
        isOpen ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )
      ) : (
        <span className="size-3 shrink-0" />
      )}
      {isOpen ? (
        <FolderOpen className="size-3 shrink-0 text-zinc-500" />
      ) : (
        <Folder className="size-3 shrink-0 text-zinc-500" />
      )}
    </>
  );

  const folderRowNormal = (
    <button
      ref={(el) => {
        setDropRef(el);
        setDragRef(el);
      }}
      type="button"
      onClick={() => onToggle(node.path)}
      className={rowClass}
      style={{ paddingLeft: rowPaddingLeft }}
    >
      {folderIcons}
      <span className="truncate">{node.name}</span>
    </button>
  );

  const folderRowRenaming = (
    <div
      ref={(el) => {
        setDropRef(el);
        setDragRef(el);
      }}
      className={rowClass}
      style={{ paddingLeft: rowPaddingLeft }}
    >
      {folderIcons}
      <RenameFolderInput
        key={node.path}
        initialName={node.name}
        onCommit={(name) => onRenameCommit(node.path, name)}
        onCancel={onRenameCancel}
      />
    </div>
  );

  return (
    <div style={{ opacity: isDragging ? 0.3 : undefined }}>
      <div className="group/folder flex items-center">
        <button
          type="button"
          className="shrink-0 cursor-grab opacity-0 group-hover/folder:opacity-100 text-zinc-600 hover:text-zinc-400 transition-opacity touch-none"
          aria-label="Drag folder"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-3" />
        </button>
        {isRenaming ? (
          folderRowRenaming
        ) : (
          <ContextMenu>
            <ContextMenuTrigger asChild>{folderRowNormal}</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onRequestRename(node.path)}>
                <Pencil className="size-3.5" />
                Rename folder
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )}
      </div>

      {isOpen && (
        <div className="pl-2">
          {node.children.map((child) => (
            <DroppableFolder
              key={child.path}
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              itemKey={itemKey}
              itemPath={itemPath}
              itemLabel={itemLabel}
              onToggleStar={onToggleStar}
              isStarred={isStarred}
              onNewFolder={onNewFolder}
              renamingPath={renamingPath}
              onRequestRename={onRequestRename}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              depth={depth + 1}
            />
          ))}
          {node.items.map((item) => (
            <div key={itemKey(item)} style={{ paddingLeft: (depth + 1) * 8 }}>
              <DraggableItem
                item={item}
                itemKey={itemKey}
                itemPath={itemPath}
                itemLabel={itemLabel}
                onToggleStar={onToggleStar}
                isStarred={isStarred}
                onNewFolder={onNewFolder}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewFolderInput({
  onCommit,
  onCancel,
}: {
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-1 py-0.5 px-1.5 text-[11px]">
      <Folder className="size-3 shrink-0 text-zinc-500" />
      <input
        autoFocus
        className="flex-1 min-w-0 bg-transparent text-[11px] text-zinc-100 outline-none border-b border-zinc-500"
        placeholder="folder name"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = e.currentTarget.value.trim();
            if (v) onCommit(v);
            else onCancel();
          }
          if (e.key === "Escape") onCancel();
        }}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          if (v) onCommit(v);
          else onCancel();
        }}
      />
    </div>
  );
}

export function SidebarFolderTree<T>({
  items,
  itemKey,
  itemPath,
  itemLabel,
  itemFolder,
  onMoveToFolder,
  onToggleStar,
  isStarred,
  storageKey,
}: SidebarFolderTreeProps<T>) {
  const [expanded, setExpanded] = useState(() => loadExpanded(storageKey));
  const [draggingLabel, setDraggingLabel] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolderPath, setRenamingFolderPath] = useState<string | null>(null);
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);

  const activeEmptyFolders = useMemo(() => {
    const used = new Set<string>();
    for (const item of items) {
      const f = itemFolder(item).replace(/^\/|\/$/g, "");
      if (f) used.add(f);
    }
    return emptyFolders.filter((f) => !used.has(f));
  }, [items, itemFolder, emptyFolders]);

  const tree = useMemo(
    () => buildTree(items, itemFolder, itemLabel, activeEmptyFolders),
    [items, itemFolder, itemLabel, activeEmptyFolders],
  );

  const toggleExpanded = useCallback(
    (path: string) => {
      setExpanded((prev) => {
        const next = { ...prev, [path]: !(prev[path] ?? false) };
        saveExpanded(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const { setNodeRef: setRootDropRef, isOver: isRootOver } = useDroppable({
    id: "folder:",
    data: { folder: "" },
  });

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingLabel((event.active.data.current?.label as string) ?? null);
  }, []);

  const collectItemsUnderFolder = useCallback(
    (folderPath: string): { key: string; folder: string }[] => {
      const prefix = folderPath + "/";
      const result: { key: string; folder: string }[] = [];
      for (const item of items) {
        const f = itemFolder(item).replace(/^\/|\/$/g, "");
        if (f === folderPath || f.startsWith(prefix)) {
          result.push({ key: itemKey(item), folder: f });
        }
      }
      return result;
    },
    [items, itemKey, itemFolder],
  );

  const applyFolderMove = useCallback(
    (srcFolder: string, newFolderPath: string) => {
      if (newFolderPath === srcFolder) return;
      if (newFolderPath.startsWith(srcFolder + "/")) return;

      const childItems = collectItemsUnderFolder(srcFolder);
      for (const child of childItems) {
        const relativePath = child.folder.slice(srcFolder.length);
        const newItemFolder = newFolderPath + relativePath;
        onMoveToFolder(child.key, newItemFolder);
      }

      setEmptyFolders((prev) => {
        const prefix = srcFolder + "/";
        return prev.map((f) => {
          if (f === srcFolder) return newFolderPath;
          if (f.startsWith(prefix)) return newFolderPath + f.slice(srcFolder.length);
          return f;
        });
      });

      setExpanded((prev) => {
        const next = { ...prev };
        const prefix = srcFolder + "/";
        for (const key of Object.keys(next)) {
          if (key === srcFolder || key.startsWith(prefix)) {
            const newKey =
              key === srcFolder ? newFolderPath : newFolderPath + key.slice(srcFolder.length);
            next[newKey] = next[key];
            delete next[key];
          }
        }
        saveExpanded(storageKey, next);
        return next;
      });
    },
    [collectItemsUnderFolder, onMoveToFolder, storageKey],
  );

  const handleRenameCommit = useCallback(
    (oldPath: string, rawName: string) => {
      const trimmed = rawName.trim();
      if (!trimmed) {
        setRenamingFolderPath(null);
        return;
      }
      if (trimmed.includes("/")) {
        toast.error("Folder name cannot contain /");
        return;
      }
      const parts = oldPath.split("/");
      const parent = parts.slice(0, -1).join("/");
      const newPath = parent ? `${parent}/${trimmed}` : trimmed;
      if (newPath === oldPath) {
        setRenamingFolderPath(null);
        return;
      }
      if (
        folderRenameCollides(oldPath, newPath, items, itemFolder, emptyFolders)
      ) {
        toast.error("A folder with that name already exists");
        return;
      }
      setRenamingFolderPath(null);
      applyFolderMove(oldPath, newPath);
    },
    [items, itemFolder, emptyFolders, applyFolderMove],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingLabel(null);
      const { active, over } = event;
      if (!over) return;
      const activeId = active.id as string;
      const targetFolder = over.data.current?.folder as string | undefined;
      if (targetFolder === undefined) return;

      if (activeId.startsWith("dragfolder:")) {
        const srcFolder = activeId.slice("dragfolder:".length);
        const srcName = srcFolder.split("/").pop() ?? srcFolder;
        const newFolderPath = targetFolder ? `${targetFolder}/${srcName}` : srcName;

        if (newFolderPath === srcFolder) return;
        // Prevent dropping into self or descendant
        if (newFolderPath.startsWith(srcFolder + "/")) return;

        applyFolderMove(srcFolder, newFolderPath);
        return;
      }

      // Regular item drag
      const currentItem = items.find((i) => itemKey(i) === activeId);
      if (!currentItem) return;
      const currentFolder = itemFolder(currentItem).replace(/^\/|\/$/g, "");
      if (targetFolder === currentFolder) return;

      onMoveToFolder(activeId, targetFolder);
    },
    [items, itemKey, itemFolder, onMoveToFolder, applyFolderMove],
  );

  const handleNewFolderCommit = useCallback(
    (name: string) => {
      setCreatingFolder(false);
      setEmptyFolders((prev) => (prev.includes(name) ? prev : [...prev, name]));
      setExpanded((prev) => {
        const next = { ...prev, [name]: true };
        saveExpanded(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );


  if (items.length === 0) return null;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setRootDropRef}
            className={cn(
              "space-y-0.5 pl-2 min-h-[4px]",
              isRootOver && "ring-1 ring-inset ring-zinc-500 rounded",
            )}
          >
            {tree.children.map((child) => (
              <DroppableFolder
                key={child.path}
                node={child}
                expanded={expanded}
                onToggle={toggleExpanded}
                itemKey={itemKey}
                itemPath={itemPath}
                itemLabel={itemLabel}
                onToggleStar={onToggleStar}
                isStarred={isStarred}
                onNewFolder={() => setCreatingFolder(true)}
                renamingPath={renamingFolderPath}
                onRequestRename={(p) => {
                  setRenamingFolderPath(p);
                  setExpanded((prev) => {
                    const next = { ...prev, [p]: true };
                    saveExpanded(storageKey, next);
                    return next;
                  });
                }}
                onRenameCommit={handleRenameCommit}
                onRenameCancel={() => setRenamingFolderPath(null)}
                depth={0}
              />
            ))}
            {tree.items.map((item) => (
              <DraggableItem
                key={itemKey(item)}
                item={item}
                itemKey={itemKey}
                itemPath={itemPath}
                itemLabel={itemLabel}
                onToggleStar={onToggleStar}
                isStarred={isStarred}
                onNewFolder={() => setCreatingFolder(true)}
              />
            ))}
            {creatingFolder && (
              <NewFolderInput
                onCommit={handleNewFolderCommit}
                onCancel={() => setCreatingFolder(false)}
              />
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setCreatingFolder(true)}>
            <FolderPlus />
            New folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <DragOverlay>
        {draggingLabel ? (
          <div className="rounded bg-zinc-800 border border-zinc-600 px-2 py-1 text-[11px] text-zinc-200 shadow-lg">
            {draggingLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
