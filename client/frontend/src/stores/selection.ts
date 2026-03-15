import { create } from "zustand";

type SelectionStore = {
  selected: Set<string>;
  toggle: (id: string) => void;
  add: (id: string) => void;
  addMany: (ids: string[]) => void;
  remove: (id: string) => void;
  clear: () => void;
  selectAll: (ids: string[]) => void;
};

export const useSelection = create<SelectionStore>((set) => ({
  selected: new Set(),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next };
    }),
  add: (id) =>
    set((s) => {
      if (s.selected.has(id)) return s;
      const next = new Set(s.selected);
      next.add(id);
      return { selected: next };
    }),
  addMany: (ids) =>
    set((s) => {
      const next = new Set(s.selected);
      let changed = false;
      for (const id of ids) {
        if (!next.has(id)) { next.add(id); changed = true; }
      }
      return changed ? { selected: next } : s;
    }),
  remove: (id) =>
    set((s) => {
      if (!s.selected.has(id)) return s;
      const next = new Set(s.selected);
      next.delete(id);
      return { selected: next };
    }),
  clear: () =>
    set((s) => (s.selected.size === 0 ? s : { selected: new Set() })),
  selectAll: (ids) =>
    set(() => ({ selected: new Set(ids) })),
}));
