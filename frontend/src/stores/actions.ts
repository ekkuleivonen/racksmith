import { create } from "zustand";
import { toast } from "sonner";
import { listActions, type ActionSummary } from "@/lib/actions";

type ActionStore = {
  actions: ActionSummary[];
  load: () => Promise<void>;
};

export const useActionsStore = create<ActionStore>((set) => ({
  actions: [],

  load: async () => {
    try {
      const result = await listActions().catch(() => ({
        actions: [],
      }));
      set({ actions: result.actions });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load actions",
      );
      set({ actions: [] });
    }
  },
}));
