import { create } from "zustand";
import type { DiffFile } from "@/lib/diff";
import { commitAndPush as apiCommitAndPush, getDiffs } from "@/lib/diff";
import { useCodeStore } from "./code";

export const useDiffStore = create<{
  files: DiffFile[];
  loading: boolean;
  committing: boolean;
  loadDiffs: () => Promise<void>;
  commitAndPush: (message: string) => Promise<{ pr_url?: string | null }>;
}>((set, get) => ({
  files: [],
  loading: false,
  committing: false,

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
      await useCodeStore.getState().refreshStatuses();
      return { pr_url: res.pr_url };
    } finally {
      set({ committing: false });
    }
  },
}));
