import { create } from "zustand";
import { toast } from "sonner";
import { listGroups } from "@/lib/groups";
import type { Group } from "@/lib/groups";

type GroupsStore = {
  groups: Group[];
  load: () => Promise<void>;
};

export const useGroupsStore = create<GroupsStore>((set) => ({
  groups: [],

  load: async () => {
    try {
      const nextGroups = await listGroups().catch(() => []);
      set({ groups: nextGroups });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load groups");
      set({ groups: [] });
    }
  },
}));
