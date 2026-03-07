import { create } from "zustand";
import { toast } from "sonner";
import { listNodes } from "@/lib/nodes";
import type { Node } from "@/lib/nodes";

type NodesStore = {
  nodes: Node[];
  load: () => Promise<void>;
};

export const useNodesStore = create<NodesStore>((set) => ({
  nodes: [],

  load: async () => {
    try {
      const nextNodes = await listNodes().catch(() => []);
      set({ nodes: nextNodes });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load nodes");
      set({ nodes: [] });
    }
  },
}));
