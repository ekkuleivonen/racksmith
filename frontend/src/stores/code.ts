import { create } from "zustand";
import { toast } from "sonner";
import { apiGet } from "@/lib/api";
import type { TreeEntry } from "@/components/code/file-tree";

type CodeStore = {
  entries: TreeEntry[];
  modifiedPaths: Record<string, true>;
  untrackedPaths: Record<string, true>;
  loading: boolean;
  loadTree: () => Promise<void>;
  refreshStatuses: () => Promise<void>;
};

export const useCodeStore = create<CodeStore>((set) => ({
  entries: [],
  modifiedPaths: {},
  untrackedPaths: {},
  loading: false,

  loadTree: async () => {
    set({ loading: true });
    try {
      const [treeData, statusData] = await Promise.all([
        apiGet<{ entries: TreeEntry[] }>("/code/tree"),
        apiGet<{
          modified_paths: string[];
          untracked_paths: string[];
        }>("/code/file-statuses"),
      ]);
      set({
        entries: treeData.entries,
        modifiedPaths: Object.fromEntries(
          statusData.modified_paths.map((path) => [path, true as const]),
        ),
        untrackedPaths: Object.fromEntries(
          statusData.untracked_paths.map((path) => [path, true as const]),
        ),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load file tree",
      );
      set({ entries: [] });
    } finally {
      set({ loading: false });
    }
  },

  refreshStatuses: async () => {
    try {
      const data = await apiGet<{
        modified_paths: string[];
        untracked_paths: string[];
      }>("/code/file-statuses");
      set({
        modifiedPaths: Object.fromEntries(
          data.modified_paths.map((path) => [path, true as const]),
        ),
        untrackedPaths: Object.fromEntries(
          data.untracked_paths.map((path) => [path, true as const]),
        ),
      });
    } catch {
      // ignore
    }
  },
}));
