import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type CanvasView = "network" | "rack" | "list";

const VALID_VIEWS: CanvasView[] = ["network", "rack", "list"];

export interface CanvasFilters {
  groups: string[];
  labels: string[];
  status: string[];
  subnets: string[];
  search: string;
}

export interface CanvasParams {
  view: CanvasView;
  selectedHostId: string | null;
  filters: CanvasFilters;
}

export interface CanvasActions {
  setView: (view: CanvasView) => void;
  selectHost: (hostId: string | null) => void;
  setFilter: (key: keyof Omit<CanvasFilters, "search">, values: string[]) => void;
  setSearch: (q: string) => void;
  clearFilters: () => void;
}

function parseCommaSeparated(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

function toCommaSeparated(values: string[]): string | null {
  const filtered = values.filter(Boolean);
  return filtered.length > 0 ? filtered.join(",") : null;
}

export function useCanvasParams(): [CanvasParams, CanvasActions] {
  const [searchParams, setSearchParams] = useSearchParams();

  const params: CanvasParams = useMemo(() => {
    const rawView = searchParams.get("view");
    const view: CanvasView = rawView && VALID_VIEWS.includes(rawView as CanvasView)
      ? (rawView as CanvasView)
      : "list";

    return {
      view,
      selectedHostId: searchParams.get("host"),
      filters: {
        groups: parseCommaSeparated(searchParams.get("groups")),
        labels: parseCommaSeparated(searchParams.get("labels")),
        status: parseCommaSeparated(searchParams.get("status")),
        subnets: parseCommaSeparated(searchParams.get("subnets")),
        search: searchParams.get("q") ?? "",
      },
    };
  }, [searchParams]);

  const updateParams = useCallback(
    (updater: (prev: URLSearchParams) => URLSearchParams) => {
      setSearchParams((prev) => updater(new URLSearchParams(prev)), { replace: true });
    },
    [setSearchParams],
  );

  const setView = useCallback(
    (view: CanvasView) => {
      updateParams((p) => {
        if (view === "list") p.delete("view");
        else p.set("view", view);
        return p;
      });
    },
    [updateParams],
  );

  const selectHost = useCallback(
    (hostId: string | null) => {
      updateParams((p) => {
        if (hostId) {
          p.set("host", hostId);
        } else {
          p.delete("host");
        }
        return p;
      });
    },
    [updateParams],
  );

  const setFilter = useCallback(
    (key: keyof Omit<CanvasFilters, "search">, values: string[]) => {
      updateParams((p) => {
        const serialized = toCommaSeparated(values);
        if (serialized) p.set(key, serialized);
        else p.delete(key);
        return p;
      });
    },
    [updateParams],
  );

  const setSearch = useCallback(
    (q: string) => {
      updateParams((p) => {
        if (q.trim()) p.set("q", q);
        else p.delete("q");
        return p;
      });
    },
    [updateParams],
  );

  const clearFilters = useCallback(
    () => {
      updateParams((p) => {
        p.delete("groups");
        p.delete("labels");
        p.delete("status");
        p.delete("subnets");
        p.delete("q");
        return p;
      });
    },
    [updateParams],
  );

  const actions: CanvasActions = useMemo(
    () => ({ setView, selectHost, setFilter, setSearch, clearFilters }),
    [setView, selectHost, setFilter, setSearch, clearFilters],
  );

  return [params, actions];
}
