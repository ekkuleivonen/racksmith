import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { RackLayoutHost, ZoneSelection } from "@/lib/racks";

const ROW_HEIGHT = 28;
const RESIZE_HANDLE_SIZE = 8;
const RESIZE_HANDLE_MIN = 4;

type ResizeHandle = "n" | "s" | "e" | "w";

type MovePosition = {
  position_u_start: number;
  position_u_height: number;
  position_col_start: number;
  position_col_count: number;
};

export function RackCanvas({
  rackUnits,
  cols,
  items,
  selectedItemId,
  pendingItemId,
  multiSelectedIds,
  onSelectItem,
  onSelectZone,
  onMoveItem,
  onResizeItem,
  onPlaceUnplacedHost,
  selectionMode = false,
}: {
  rackUnits: number;
  cols: number;
  items: RackLayoutHost[];
  selectedItemId?: string | null;
  pendingItemId?: string | null;
  multiSelectedIds?: ReadonlySet<string>;
  onSelectItem?: (itemId: string, event?: React.MouseEvent) => void;
  onSelectZone?: (zone: ZoneSelection) => void;
  onMoveItem?: (itemId: string, position: MovePosition) => void;
  onResizeItem?: (itemId: string, position: MovePosition) => void;
  onPlaceUnplacedHost?: (hostId: string, position: MovePosition) => void;
  selectionMode?: boolean;
}) {
  const totalHeight = rackUnits * ROW_HEIGHT;
  const placedItems = useMemo(() => items.filter((item) => item.placement === "rack"), [items]);
  const [dragStart, setDragStart] = useState<{ u: number; col: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ u: number; col: number } | null>(null);
  const [draggedItem, setDraggedItem] = useState<{
    itemId: string;
    position_u_height: number;
    position_col_count: number;
  } | null>(null);
  const [dropPreviewTarget, setDropPreviewTarget] = useState<{ topU: number; dropCol: number } | null>(null);
  const [dropPreviewUnplaced, setDropPreviewUnplaced] = useState(false);
  const [resizing, setResizing] = useState<{
    item: RackLayoutHost;
    handle: ResizeHandle;
  } | null>(null);
  const resizePreviewRef = useRef<MovePosition | null>(null);
  const rackGridRef = useRef<HTMLDivElement>(null);

  const norm = useCallback(
    (start: { u: number; col: number }, end: { u: number; col: number }): ZoneSelection => {
      const startU = Math.max(start.u, end.u);
      const heightU = Math.abs(start.u - end.u) + 1;
      const startCol = Math.min(start.col, end.col);
      const colCount = Math.abs(start.col - end.col) + 1;
      return { startU, heightU, startCol, colCount };
    },
    []
  );

  const handleCellMouseDown = useCallback(
    (u: number, col: number) => {
      if (!selectionMode || !onSelectZone) return;
      setDragStart({ u, col });
      setDragEnd({ u, col });
    },
    [onSelectZone, selectionMode]
  );

  const handleCellMouseEnter = useCallback(
    (u: number, col: number) => {
      if (!selectionMode || !dragStart) return;
      setDragEnd({ u, col });
    },
    [dragStart, selectionMode]
  );

  useEffect(() => {
    if (!selectionMode || !dragStart) return;
    const onUp = () => {
      if (dragStart && dragEnd) {
        const zone = norm(dragStart, dragEnd);
        if (zone.heightU >= 1 && zone.colCount >= 1 && onSelectZone) {
          onSelectZone(zone);
        }
      }
      setDragStart(null);
      setDragEnd(null);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [selectionMode, dragStart, dragEnd, norm, onSelectZone]);

  const selectionZone =
    dragStart && dragEnd ? norm(dragStart, dragEnd) : null;

  const isCellInSelection = useCallback(
    (u: number, col: number) => {
      if (!selectionZone) return false;
      const bottomU = selectionZone.startU - selectionZone.heightU + 1;
      return (
        u >= bottomU &&
        u <= selectionZone.startU &&
        col >= selectionZone.startCol &&
        col < selectionZone.startCol + selectionZone.colCount
      );
    },
    [selectionZone]
  );

  const isCellOccupied = useCallback(
    (u: number, col: number, excludeItemId?: string) =>
      placedItems.some(
        (item) => {
          if (excludeItemId && item.id === excludeItemId) return false;
          const bottomU = item.position_u_start;
          const topU = item.position_u_start + item.position_u_height - 1;
          return (
            u >= bottomU &&
            u <= topU &&
            col >= item.position_col_start &&
            col < item.position_col_start + item.position_col_count
          );
        }
      ),
    [placedItems]
  );

  const handleItemDragStart = useCallback((e: React.DragEvent, item: RackLayoutHost) => {
    e.dataTransfer.setData(
      "application/x-racksmith-item",
      JSON.stringify({
        itemId: item.id,
        position_u_height: item.position_u_height,
        position_col_count: item.position_col_count,
      })
    );
    e.dataTransfer.effectAllowed = "move";
    setDraggedItem({
      itemId: item.id,
      position_u_height: item.position_u_height,
      position_col_count: item.position_col_count,
    });
  }, []);

  const handleItemDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDropPreviewTarget(null);
  }, []);

  const handleCellDrop = useCallback(
    (e: React.DragEvent, dropU: number, dropCol: number) => {
      e.preventDefault();
      setDropPreviewTarget(null);
      setDropPreviewUnplaced(false);

      const unplacedRaw = e.dataTransfer.getData("application/x-racksmith-unplaced-host");
      if (unplacedRaw && onPlaceUnplacedHost) {
        try {
          const { hostId } = JSON.parse(unplacedRaw);
          const topU = dropU;
          const bottomU = topU;
          const position_u_height = 1;
          const position_col_count = 1;
          if (bottomU < 1 || topU > rackUnits || dropCol >= cols) return;
          if (isCellOccupied(bottomU, dropCol)) return;
          onPlaceUnplacedHost(hostId, {
            position_u_start: bottomU,
            position_u_height,
            position_col_start: dropCol,
            position_col_count,
          });
        } catch {
          // ignore
        }
        return;
      }

      const raw = e.dataTransfer.getData("application/x-racksmith-item");
      if (!raw || !onMoveItem) return;
      try {
        const { itemId, position_u_height, position_col_count } = JSON.parse(raw);
        const topU = dropU;
        const bottomU = topU - position_u_height + 1;
        if (bottomU < 1) return;
        if (topU > rackUnits) return;
        if (dropCol + position_col_count > cols) return;
        for (let u = bottomU; u <= topU; u++) {
          for (let c = dropCol; c < dropCol + position_col_count; c++) {
            if (isCellOccupied(u, c, itemId)) return;
          }
        }
        onMoveItem(itemId, {
          position_u_start: bottomU,
          position_u_height,
          position_col_start: dropCol,
          position_col_count,
        });
      } catch {
        // ignore invalid data
      }
    },
    [cols, isCellOccupied, onMoveItem, onPlaceUnplacedHost, rackUnits]
  );

  const handleCellDragOver = useCallback(
    (e: React.DragEvent, topU?: number, dropCol?: number) => {
      const hasItem = e.dataTransfer.types.includes("application/x-racksmith-item");
      const hasUnplaced = e.dataTransfer.types.includes("application/x-racksmith-unplaced-host");
      if (hasItem || hasUnplaced) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (topU !== undefined && dropCol !== undefined) {
          setDropPreviewTarget({ topU, dropCol });
          setDropPreviewUnplaced(hasUnplaced);
        }
      }
    },
    []
  );

  const clientToGrid = useCallback(
    (clientX: number, clientY: number): { u: number; col: number } | null => {
      const el = rackGridRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null;
      const col = Math.floor((localX / rect.width) * cols);
      const rowIndex = Math.floor(localY / ROW_HEIGHT);
      const u = rackUnits - rowIndex;
      return {
        u: Math.max(1, Math.min(rackUnits, u)),
        col: Math.max(0, Math.min(cols - 1, col)),
      };
    },
    [cols, rackUnits]
  );

  const [resizePreview, setResizePreview] = useState<MovePosition | null>(null);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, item: RackLayoutHost, handle: ResizeHandle) => {
      e.preventDefault();
      e.stopPropagation();
      if (!onResizeItem) return;
      setResizing({ item, handle });
      resizePreviewRef.current = {
        position_u_start: item.position_u_start,
        position_u_height: item.position_u_height,
        position_col_start: item.position_col_start,
        position_col_count: item.position_col_count,
      };
      setResizePreview(resizePreviewRef.current);
    },
    [onResizeItem]
  );

  useEffect(() => {
    if (!resizing || !onResizeItem || !rackGridRef.current) return;
    const { item, handle } = resizing;
    const topU = item.position_u_start + item.position_u_height - 1;
    const rightCol = item.position_col_start + item.position_col_count - 1;

    const onMove = (e: MouseEvent) => {
      const g = clientToGrid(e.clientX, e.clientY);
      if (!g) return;
      const prev = resizePreviewRef.current ?? {
        position_u_start: item.position_u_start,
        position_u_height: item.position_u_height,
        position_col_start: item.position_col_start,
        position_col_count: item.position_col_count,
      };
      const pos = { ...prev };
      if (handle === "n") {
        const newTopU = Math.max(item.position_u_start, g.u);
        pos.position_u_height = newTopU - item.position_u_start + 1;
      } else if (handle === "s") {
        const newBottomU = Math.min(topU, g.u);
        pos.position_u_start = newBottomU;
        pos.position_u_height = topU - newBottomU + 1;
      } else if (handle === "e") {
        const newRightCol = Math.max(item.position_col_start, g.col);
        pos.position_col_count = newRightCol - item.position_col_start + 1;
      } else if (handle === "w") {
        const newLeftCol = Math.min(rightCol, g.col);
        pos.position_col_start = newLeftCol;
        pos.position_col_count = rightCol - newLeftCol + 1;
      }
      pos.position_u_height = Math.max(1, pos.position_u_height);
      pos.position_col_count = Math.max(1, pos.position_col_count);
      if (pos.position_u_start < 1) pos.position_u_start = 1;
      if (pos.position_col_start + pos.position_col_count > cols) {
        pos.position_col_count = cols - pos.position_col_start;
      }
      resizePreviewRef.current = pos;
      setResizePreview(pos);
    };

    const onUp = () => {
      const pos = resizePreviewRef.current;
      if (pos) {
        let valid = true;
        for (let u = pos.position_u_start; u < pos.position_u_start + pos.position_u_height; u++) {
          for (let c = pos.position_col_start; c < pos.position_col_start + pos.position_col_count; c++) {
            if (isCellOccupied(u, c, item.id)) valid = false;
          }
        }
        if (valid) onResizeItem(item.id, pos);
      }
      setResizing(null);
      setResizePreview(null);
      resizePreviewRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing, onResizeItem, clientToGrid, cols, isCellOccupied]);

  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="grid grid-cols-[44px_1fr] gap-2">
        <div className="relative" style={{ height: totalHeight }}>
          {Array.from({ length: rackUnits }, (_, index) => {
            const u = rackUnits - index;
            return (
              <div
                key={`label-${u}`}
                className="h-7 text-[11px] text-zinc-500 flex items-center justify-end pr-1 border-b border-zinc-900"
              >
                {u}U
              </div>
            );
          })}
        </div>
        <div
          ref={rackGridRef}
          className="relative border border-zinc-700 bg-zinc-900/50"
          style={{ height: totalHeight }}
        >
          <div
            className="grid h-full w-full gap-px"
            style={{
              gridTemplateRows: `repeat(${rackUnits}, minmax(0, ${ROW_HEIGHT}px))`,
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            }}
            onMouseLeave={() => {
              if (selectionMode && dragStart) {
                setDragEnd(dragStart);
              }
            }}
          >
            {Array.from({ length: rackUnits * cols }, (_, i) => {
              const u = rackUnits - Math.floor(i / cols);
              const col = i % cols;
              return (
                <div
                  key={`cell-${u}-${col}`}
                  data-u={u}
                  data-col={col}
                  className={cn(
                    "min-h-[26px] border border-zinc-800/40 transition-colors",
                    selectionMode && "cursor-crosshair",
                    isCellInSelection(u, col) && "bg-sky-500/30 border-sky-400/60",
                    selectionMode && !isCellInSelection(u, col) && isCellOccupied(u, col) && "bg-zinc-700/50"
                  )}
                  onMouseDown={() => handleCellMouseDown(u, col)}
                  onMouseEnter={() => handleCellMouseEnter(u, col)}
                  onDragOver={(e) => handleCellDragOver(e, u, col)}
                  onDrop={(e) => {
                    handleCellDrop(e, u, col);
                    setDraggedItem(null);
                    setDropPreviewTarget(null);
                  }}
                />
              );
            })}
          </div>

          {(dropPreviewUnplaced && dropPreviewTarget && !draggedItem
            ? (() => {
                const { topU, dropCol } = dropPreviewTarget;
                const bottomU = topU;
                const isValid =
                  bottomU >= 1 &&
                  topU <= rackUnits &&
                  dropCol < cols &&
                  !isCellOccupied(bottomU, dropCol);
                const top = (rackUnits - topU) * ROW_HEIGHT;
                const height = ROW_HEIGHT;
                const leftPct = (dropCol / cols) * 100;
                const widthPct = (1 / cols) * 100;
                return (
                  <div
                    className={cn(
                      "absolute pointer-events-none border-2 border-dashed",
                      isValid
                        ? "border-emerald-400/80 bg-emerald-500/20"
                        : "border-red-400/60 bg-red-500/10"
                    )}
                    style={{
                      top,
                      height,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                    }}
                  />
                );
              })()
            : null)}
          {dropPreviewUnplaced &&
            dropPreviewTarget &&
            !draggedItem &&
            (() => {
              const { topU, dropCol } = dropPreviewTarget;
              const position_u_height = 1;
              const position_col_count = 1;
              const bottomU = topU;
              const isValid =
                bottomU >= 1 &&
                topU <= rackUnits &&
                dropCol + position_col_count <= cols &&
                !isCellOccupied(bottomU, dropCol);
              const top = (rackUnits - (bottomU + position_u_height - 1)) * ROW_HEIGHT;
              const height = position_u_height * ROW_HEIGHT;
              const leftPct = (dropCol / cols) * 100;
              const widthPct = (position_col_count / cols) * 100;
              return (
                <div
                  className={cn(
                    "absolute pointer-events-none border-2 border-dashed",
                    isValid
                      ? "border-emerald-400/80 bg-emerald-500/20"
                      : "border-red-400/60 bg-red-500/10"
                  )}
                  style={{
                    top,
                    height,
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                  }}
                />
              );
            })()}

          {draggedItem &&
            dropPreviewTarget &&
            (() => {
              const position_u_height = draggedItem.position_u_height;
              const position_col_count = draggedItem.position_col_count;
              const itemId = draggedItem.itemId;
              const { topU, dropCol } = dropPreviewTarget;
              const bottomU = topU - position_u_height + 1;
              let isValid =
                bottomU >= 1 &&
                topU <= rackUnits &&
                dropCol + position_col_count <= cols;
              if (isValid) {
                for (let u = bottomU; u <= topU; u++) {
                  for (let c = dropCol; c < dropCol + position_col_count; c++) {
                    if (isCellOccupied(u, c, itemId)) {
                      isValid = false;
                      break;
                    }
                  }
                }
              }
              const top =
                (rackUnits - (bottomU + position_u_height - 1)) * ROW_HEIGHT;
              const height = position_u_height * ROW_HEIGHT;
              const leftPct = (dropCol / cols) * 100;
              const widthPct = (position_col_count / cols) * 100;
              return (
                <div
                  className={cn(
                    "absolute pointer-events-none border-2 border-dashed",
                    isValid
                      ? "border-emerald-400/80 bg-emerald-500/20"
                      : "border-red-400/60 bg-red-500/10"
                  )}
                  style={{
                    top,
                    height,
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                  }}
                />
              );
            })()}

          {dropPreviewUnplaced &&
            dropPreviewTarget &&
            (() => {
              const { topU, dropCol } = dropPreviewTarget;
              const position_u_height = 1;
              const position_col_count = 1;
              const bottomU = topU;
              const isValid =
                bottomU >= 1 &&
                topU <= rackUnits &&
                dropCol + position_col_count <= cols &&
                !isCellOccupied(bottomU, dropCol);
              const top = (rackUnits - topU) * ROW_HEIGHT;
              const height = position_u_height * ROW_HEIGHT;
              const leftPct = (dropCol / cols) * 100;
              const widthPct = (position_col_count / cols) * 100;
              return (
                <div
                  className={cn(
                    "absolute pointer-events-none border-2 border-dashed",
                    isValid
                      ? "border-emerald-400/80 bg-emerald-500/20"
                      : "border-red-400/60 bg-red-500/10"
                  )}
                  style={{
                    top,
                    height,
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                  }}
                />
              );
            })()}

          {placedItems.map((item) => {
            const isUnmanaged = !item.managed;
            const isPending = pendingItemId === item.id;
            const isResizing = resizing?.item.id === item.id;
            const isMultiSelected = !isUnmanaged && (multiSelectedIds?.has(item.id) ?? false);
            const pos = isResizing && resizePreview ? resizePreview : item;
            const top =
              (rackUnits - (pos.position_u_start + pos.position_u_height - 1)) * ROW_HEIGHT;
            const height = pos.position_u_height * ROW_HEIGHT;
            const leftPct = (pos.position_col_start / cols) * 100;
            const widthPct = (pos.position_col_count / cols) * 100;
            const canResize =
              !isUnmanaged && !isPending && !!onResizeItem && (height > RESIZE_HANDLE_MIN || widthPct > 4);
            const canDrag = !isUnmanaged && !isPending && !!onMoveItem;
            return (
              <div
                key={item.id}
                className={cn(
                  "absolute rounded-none border text-left overflow-visible",
                  isResizing && "opacity-50",
                  isUnmanaged
                    ? "border-zinc-700 bg-zinc-800/60"
                    : isPending
                    ? "border-zinc-500/80 bg-zinc-500/15"
                    : isMultiSelected
                    ? "border-blue-500/60 bg-blue-500/10"
                    : selectedItemId === item.id
                    ? "border-emerald-400 bg-emerald-500/20"
                    : "border-sky-400/60 bg-sky-500/10 hover:bg-sky-500/20"
                )}
                style={{
                  top,
                  height,
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                }}
              >
                {canResize && (
                  <>
                    <div
                      className="absolute top-0 bottom-0 cursor-ew-resize hover:bg-sky-400/30 z-10"
                      style={{ left: 0, width: RESIZE_HANDLE_SIZE, marginLeft: -RESIZE_HANDLE_SIZE / 2 }}
                      onMouseDown={(e) => handleResizeMouseDown(e, item, "w")}
                    />
                    <div
                      className="absolute top-0 bottom-0 cursor-ew-resize hover:bg-sky-400/30 z-10"
                      style={{ right: 0, width: RESIZE_HANDLE_SIZE, marginRight: -RESIZE_HANDLE_SIZE / 2 }}
                      onMouseDown={(e) => handleResizeMouseDown(e, item, "e")}
                    />
                    <div
                      className="absolute left-0 right-0 top-0 cursor-ns-resize hover:bg-sky-400/30 z-10"
                      style={{ top: 0, height: RESIZE_HANDLE_SIZE, marginTop: -RESIZE_HANDLE_SIZE / 2 }}
                      onMouseDown={(e) => handleResizeMouseDown(e, item, "n")}
                    />
                    <div
                      className="absolute left-0 right-0 bottom-0 cursor-ns-resize hover:bg-sky-400/30 z-10"
                      style={{ bottom: 0, height: RESIZE_HANDLE_SIZE, marginBottom: -RESIZE_HANDLE_SIZE / 2 }}
                      onMouseDown={(e) => handleResizeMouseDown(e, item, "s")}
                    />
                  </>
                )}
                <div
                  draggable={canDrag}
                  className={cn(
                    "h-full px-2 py-1 overflow-hidden",
                    isUnmanaged
                      ? "cursor-default"
                      : isPending
                      ? "opacity-80 cursor-default"
                      : onMoveItem && "cursor-grab active:cursor-grabbing"
                  )}
                  onDragStart={(e) => { if (!isUnmanaged) handleItemDragStart(e, item); }}
                  onDragEnd={handleItemDragEnd}
                  onDragOver={(e) => {
                    const topU = item.position_u_start + item.position_u_height - 1;
                    handleCellDragOver(e, topU, item.position_col_start);
                  }}
                  onDrop={(e) => {
                    const topU = item.position_u_start + item.position_u_height - 1;
                    handleCellDrop(e, topU, item.position_col_start);
                    setDraggedItem(null);
                    setDropPreviewTarget(null);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isUnmanaged) onSelectItem?.(item.id, e);
                  }}
                >
                  <p className={cn("text-[11px] truncate", isUnmanaged ? "text-zinc-500" : "text-zinc-100")}>
                    {item.name || item.hostname || item.ip_address || (isPending ? "Pending details" : "Unassigned")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
