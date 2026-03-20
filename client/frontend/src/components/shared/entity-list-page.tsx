import { NavLink } from "react-router-dom";
import { Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "./page-container";

interface EntityListPageProps {
  title: string;
  description: string;
  createPath: string;
  createLabel: string;
  isLoading: boolean;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  emptyContent?: React.ReactNode;
  emptySecondaryAction?: { label: string; path: string };
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filterBar?: React.ReactNode;
  afterContent?: React.ReactNode;
}

export function EntityListPage({
  title,
  description,
  createPath,
  createLabel,
  isLoading,
  isEmpty,
  emptyTitle,
  emptyDescription,
  emptyContent,
  emptySecondaryAction,
  children,
  headerExtra,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  filterBar,
  afterContent,
}: EntityListPageProps) {
  return (
    <PageContainer>
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-zinc-100 font-semibold">{title}</h1>
            <p className="text-xs text-zinc-500">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            {headerExtra}
            <NavLink to={createPath}>
              <Button size="sm">
                <Plus className="size-3.5" />
                {createLabel}
              </Button>
            </NavLink>
          </div>
        </section>

        {(onSearchChange !== undefined || filterBar) && (
          <section className="border border-zinc-800 bg-zinc-900/30 px-4 py-3 space-y-3">
            {onSearchChange !== undefined && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500 pointer-events-none" />
                <Input
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="pl-8 h-8 text-xs bg-zinc-950/40 border-zinc-800"
                />
              </div>
            )}
            {filterBar}
          </section>
        )}

        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-zinc-500">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : isEmpty ? (
            emptyContent ?? (
              <div className="py-8 text-center space-y-3">
                <p className="text-zinc-500 text-sm">{emptyTitle}</p>
                {emptyDescription && (
                  <p className="text-xs text-zinc-600 mt-1">{emptyDescription}</p>
                )}
                <div className="flex justify-center gap-3">
                  <NavLink to={createPath}>
                    <Button variant="outline" size="sm">
                      <Plus className="size-3.5" />
                      {createLabel}
                    </Button>
                  </NavLink>
                  {emptySecondaryAction && (
                    <NavLink to={emptySecondaryAction.path}>
                      <Button variant="outline" size="sm">
                        {emptySecondaryAction.label}
                      </Button>
                    </NavLink>
                  )}
                </div>
              </div>
            )
          ) : (
            children
          )}
        </section>

        {afterContent}
    </PageContainer>
  );
}
