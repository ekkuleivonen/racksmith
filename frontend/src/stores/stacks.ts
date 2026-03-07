import { create } from "zustand";
import { toast } from "sonner";
import { listStacks, type StackSummary } from "@/lib/stacks";

type StackStore = {
  stacks: StackSummary[];
  load: () => Promise<void>;
};

export const useStackStore = create<StackStore>((set) => ({
  stacks: [],

  load: async () => {
    try {
      const result = await listStacks().catch(() => ({
        stacks: [],
        actions: [],
      }));
      set({ stacks: result.stacks });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load stacks",
      );
      set({ stacks: [] });
    }
  },
}));
