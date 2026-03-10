import { create } from "zustand";
import { getApiVersion } from "@/lib/version";

const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type VersionStore = {
  backendVersion: string | null;
  showBanner: boolean;
  dismissed: boolean;
  check: () => Promise<void>;
  dismiss: () => void;
};

export const useVersionStore = create<VersionStore>((set, get) => ({
  backendVersion: null,
  showBanner: false,
  dismissed: false,

  check: async () => {
    try {
      const data = await getApiVersion();
      const mismatched = data.version !== APP_VERSION;
      set({
        backendVersion: data.version,
        showBanner: mismatched,
        dismissed: mismatched ? false : get().dismissed,
      });
    } catch {
      set({ backendVersion: null, showBanner: false });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));

export function initVersionCheck(): () => void {
  const store = useVersionStore.getState();
  store.check();

  const onFocus = () => store.check();

  const intervalId = setInterval(() => store.check(), CHECK_INTERVAL_MS);
  window.addEventListener("focus", onFocus);

  return () => {
    clearInterval(intervalId);
    window.removeEventListener("focus", onFocus);
  };
}
