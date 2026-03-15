import { NavLink } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  /** Optional secondary action shown in empty state (e.g. "Import from registry") */
  emptySecondaryAction?: { label: string; path: string };
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
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
    </PageContainer>
  );
}
