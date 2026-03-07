import { create } from "zustand";
import { toast } from "sonner";
import { getRack, listRacks } from "@/lib/racks";
import type { RackNavEntry } from "@/lib/racks";

type RackStore = {
  rackEntries: RackNavEntry[];
  load: () => Promise<void>;
};

export const useRackStore = create<RackStore>((set) => ({
  rackEntries: [],

  load: async () => {
    try {
      const nextRacks = await listRacks().catch(() => []);
      const nextRackEntries = await Promise.all(
        nextRacks.map(async (rack) => {
          const detail = await getRack(rack.id);
          return { rack, items: detail.items.filter((item) => item.managed) };
        }),
      );
      set({ rackEntries: nextRackEntries });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load racks");
      set({ rackEntries: [] });
    }
  },
}));
