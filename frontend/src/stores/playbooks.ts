import { create } from "zustand";
import { toast } from "sonner";
import { listPlaybooks, type PlaybookSummary } from "@/lib/playbooks";

type PlaybookStore = {
  playbooks: PlaybookSummary[];
  load: () => Promise<void>;
};

export const usePlaybookStore = create<PlaybookStore>((set) => ({
  playbooks: [],

  load: async () => {
    try {
      const result = await listPlaybooks().catch(() => ({
        playbooks: [],
        role_templates: [],
      }));
      set({ playbooks: result.playbooks });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load playbooks",
      );
      set({ playbooks: [] });
    }
  },
}));
