import { create } from "zustand";
import { toast } from "sonner";
import { listRacks, getRackLayout } from "@/lib/racks";
import type { RackSummary } from "@/lib/racks";
import type { Node } from "@/lib/nodes";

export type RackNavEntry = {
  rack: RackSummary;
  nodes: Node[];
};

type RacksStore = {
  rackEntries: RackNavEntry[];
  load: () => Promise<void>;
};

export const useRackStore = create<RacksStore>((set) => ({
  rackEntries: [],

  load: async () => {
    try {
      const nextRacks = await listRacks().catch(() => []);
      const nextRackEntries = await Promise.all(
        nextRacks.map(async (rack) => {
          const { layout } = await getRackLayout(rack.slug);
          return {
            rack,
            nodes: layout.nodes.filter((n) => n.managed),
          };
        }),
      );
      set({ rackEntries: nextRackEntries });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load racks");
      set({ rackEntries: [] });
    }
  },
}));
