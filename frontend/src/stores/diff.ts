import { create } from "zustand";
import type { DiffFile } from "@/lib/diff";
import {
  commitAndPush as apiCommitAndPush,
  discardChanges as apiDiscardChanges,
  getDiffs,
} from "@/lib/diff";
import { queryClient, queryKeys } from "@/lib/queryClient";

export const useDiffStore = create<{
  files: DiffFile[];
  loading: boolean;
  committing: boolean;
  discarding: boolean;
  loadDiffs: () => Promise<void>;
  commitAndPush: (message: string) => Promise<{ pr_url?: string | null }>;
  discardChanges: () => Promise<void>;
}>((set, get) => ({
  files: [],
  loading: false,
  committing: false,
  discarding: false,

  loadDiffs: async () => {
    set({ loading: true });
    try {
      const data = await getDiffs();
      set({ files: data.files });
    } catch {
      set({ files: [] });
    } finally {
      set({ loading: false });
    }
  },

  commitAndPush: async (message: string) => {
    set({ committing: true });
    try {
      const res = await apiCommitAndPush(message);
      await get().loadDiffs();
      void queryClient.invalidateQueries({ queryKey: queryKeys.codeStatuses });
      return { pr_url: res.pr_url };
    } finally {
      set({ committing: false });
    }
  },

  discardChanges: async () => {
    set({ discarding: true });
    try {
      await apiDiscardChanges();
      await get().loadDiffs();
      void queryClient.invalidateQueries({ queryKey: queryKeys.codeStatuses });
      void queryClient.invalidateQueries({ queryKey: queryKeys.codeTree });
    } finally {
      set({ discarding: false });
    }
  },
}));
