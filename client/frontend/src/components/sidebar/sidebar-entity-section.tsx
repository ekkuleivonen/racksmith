import { NavLink, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SidebarEntitySectionProps<T> {
  title: string;
  icon: React.ReactNode;
  basePath?: string;
  createPath: string;
  createLabel: string;
  items: T[];
  itemKey: (item: T) => string;
  itemPath: (item: T) => string;
  itemLabel: (item: T) => string;
  emptyMessage: string;
  collapsed?: boolean;
}

export function SidebarEntitySection<T>({
  title,
  icon,
  basePath,
  createPath,
  createLabel,
  items,
  itemKey,
  itemPath,
  itemLabel,
  emptyMessage,
  collapsed,
}: SidebarEntitySectionProps<T>) {
  const { pathname } = useLocation();

  const titleContent = (
    <>
      {icon}
      {title}
    </>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border border-transparent">
        {basePath ? (
          <NavLink
            to={basePath}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-1.5 text-[11px] uppercase tracking-wide",
                isActive || pathname.startsWith(basePath)
                  ? "text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200",
              )
            }
          >
            {titleContent}
          </NavLink>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-400">
            {titleContent}
          </span>
        )}
        <NavLink
          to={createPath}
          className="text-zinc-500 hover:text-zinc-100"
          aria-label={createLabel}
        >
          <Plus className="size-3" />
        </NavLink>
      </div>
      {!collapsed && (
        <div className="space-y-0.5 pl-2">
          {items.length === 0 ? (
            <p className="px-2 py-0.5 text-[10px] text-zinc-500">{emptyMessage}</p>
          ) : (
            items.map((item) => (
              <NavLink
                key={itemKey(item)}
                to={itemPath(item)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded py-0.5 px-1.5 text-[11px] no-underline",
                    isActive
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300",
                  )
                }
              >
                <span className="truncate">{itemLabel(item)}</span>
              </NavLink>
            ))
          )}
        </div>
      )}
    </div>
  );
}
