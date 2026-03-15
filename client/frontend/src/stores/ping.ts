import { create } from "zustand";
import {
  fetchPingStatuses,
  hostStatusKey,
  type PingStatus,
  type PingStatusTarget,
} from "@/lib/ssh";

type PingStore = {
  statuses: Record<string, PingStatus>;
  startPolling: (targets: PingStatusTarget[]) => void;
  stopPolling: () => void;
};

let pollTimer: number | null = null;

export const usePingStore = create<PingStore>((set, get) => ({
  statuses: {},

  startPolling: (targets: PingStatusTarget[]) => {
    get().stopPolling();
    if (targets.length === 0) {
      set({ statuses: {} });
      return;
    }

    const poll = async () => {
      try {
        const response = await fetchPingStatuses(targets);
        set({
          statuses: Object.fromEntries(
            response.statuses.map((entry) => [
              hostStatusKey(entry.host_id),
              entry.status,
            ]),
          ),
        });
      } catch {
        // ignore
      } finally {
        if (pollTimer !== null) window.clearTimeout(pollTimer);
        pollTimer = window.setTimeout(() => {
          pollTimer = null;
          void poll();
        }, 10000) as unknown as number;
      }
    };

    void poll();
  },

  stopPolling: () => {
    if (pollTimer !== null) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  },
}));
