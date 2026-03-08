import { create } from "zustand";

type CodeUIStore = {
  expandedPaths: Record<string, boolean>;
  toggleExpanded: (path: string) => void;
};

export const useCodeStore = create<CodeUIStore>((set) => ({
  expandedPaths: {},
  toggleExpanded: (path: string) =>
    set((state) => ({
      expandedPaths: {
        ...state.expandedPaths,
        [path]: !state.expandedPaths[path],
      },
    })),
}));
