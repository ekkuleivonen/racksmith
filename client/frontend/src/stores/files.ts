import { create } from "zustand";

type FilesUIStore = {
  expandedPaths: Record<string, boolean>;
  toggleExpanded: (path: string) => void;
};

export const useFilesStore = create<FilesUIStore>((set) => ({
  expandedPaths: {},
  toggleExpanded: (path: string) =>
    set((state) => ({
      expandedPaths: {
        ...state.expandedPaths,
        [path]: !state.expandedPaths[path],
      },
    })),
}));
