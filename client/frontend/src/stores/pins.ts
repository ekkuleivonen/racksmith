import { create } from "zustand";

const STORAGE_KEY = "racksmith-pins";

export type PinEntry = {
  path: string;
  label: string;
};

const EMPTY_PINS: PinEntry[] = [];

type PinsState = {
  /** Keyed by "{login}/{repo_full_name}" */
  pins: Record<string, PinEntry[]>;
};

type PinsActions = {
  togglePin: (repoKey: string, path: string, label: string) => void;
  isPinned: (repoKey: string, path: string) => boolean;
  getPins: (repoKey: string) => PinEntry[];
};

function loadFromStorage(): Record<string, PinEntry[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function saveToStorage(pins: Record<string, PinEntry[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  } catch {
    // ignore
  }
}

export const usePinsStore = create<PinsState & PinsActions>((set, get) => ({
  pins: loadFromStorage(),

  togglePin: (repoKey, path, label) =>
    set((s) => {
      const current = s.pins[repoKey] ?? [];
      const exists = current.some((p) => p.path === path);
      const next = exists
        ? current.filter((p) => p.path !== path)
        : [...current, { path, label }];
      const pins = { ...s.pins, [repoKey]: next };
      saveToStorage(pins);
      return { pins };
    }),

  isPinned: (repoKey, path) => {
    const current = get().pins[repoKey] ?? EMPTY_PINS;
    return current.some((p) => p.path === path);
  },

  getPins: (repoKey) => get().pins[repoKey] ?? EMPTY_PINS,
}));
