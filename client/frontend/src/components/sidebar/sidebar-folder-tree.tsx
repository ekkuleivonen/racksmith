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
  Star,
} from "lucide-react";
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
  depth: number;
}) {
  const isOpen = expanded[node.path] ?? true;
  const { setNodeRef, isOver } = useDroppable({
    id: `folder:${node.path}`,
    data: { folder: node.path },
  });
  const hasContent = node.children.length > 0 || node.items.length > 0;

  return (
    <div>
      <button
        ref={setNodeRef}
        type="button"
        onClick={() => onToggle(node.path)}
        className={cn(
          "flex w-full items-center gap-1 rounded py-0.5 px-1.5 text-[11px] text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300 transition-colors",
          isOver && "bg-zinc-700/60 ring-1 ring-zinc-500",
        )}
        style={{ paddingLeft: depth * 8 + 6 }}
      >
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
        <span className="truncate">{node.name}</span>
      </button>

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
        const next = { ...prev, [path]: !(prev[path] ?? true) };
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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingLabel(null);
      const { active, over } = event;
      if (!over) return;
      const key = active.id as string;
      const targetFolder = over.data.current?.folder as string | undefined;
      if (targetFolder === undefined) return;

      const currentItem = items.find((i) => itemKey(i) === key);
      if (!currentItem) return;
      const currentFolder = itemFolder(currentItem).replace(/^\/|\/$/g, "");
      if (targetFolder === currentFolder) return;

      onMoveToFolder(key, targetFolder);
    },
    [items, itemKey, itemFolder, onMoveToFolder],
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
