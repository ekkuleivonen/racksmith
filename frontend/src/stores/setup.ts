import { create } from "zustand";
import { toast } from "sonner";
import {
  activateLocalRepo,
  dropLocalRepo,
  getSetupStatus,
  listLocalRepos,
  type LocalRepo,
  type SetupStatus,
} from "@/lib/setup";
import { fetchMachinePublicKey } from "@/lib/ssh";
import { useRackStore } from "./racks";
import { useNodesStore } from "./nodes";
import { useGroupsStore } from "./groups";
import { usePlaybookStore } from "./playbooks";

type SetupStore = {
  status: SetupStatus | null;
  localRepos: LocalRepo[];
  loading: boolean;
  switchingRepo: boolean;
  publicKey: string;
  loadingPublicKey: boolean;
  publicKeyOpen: boolean;
  load: () => Promise<void>;
  switchRepo: (owner: string, repo: string) => Promise<void>;
  dropRepo: (owner: string, repo: string) => Promise<void>;
  openPublicKey: () => Promise<void>;
  setPublicKeyOpen: (open: boolean) => void;
};

export const useSetupStore = create<SetupStore>((set, get) => ({
  status: null,
  localRepos: [],
  loading: true,
  switchingRepo: false,
  publicKey: "",
  loadingPublicKey: false,
  publicKeyOpen: false,

  load: async () => {
    try {
      const [nextStatus, nextLocalRepos] = await Promise.all([
        getSetupStatus(),
        listLocalRepos().catch(() => []),
      ]);
      set({ status: nextStatus, localRepos: nextLocalRepos });
    } catch {
      set({ status: null, localRepos: [] });
    } finally {
      set({ loading: false });
    }
  },

  switchRepo: async (owner: string, repo: string) => {
    set({ switchingRepo: true });
    try {
      await activateLocalRepo(owner, repo);
      const [nextStatus, nextLocalRepos] = await Promise.all([
        getSetupStatus(),
        listLocalRepos().catch(() => []),
      ]);
      set({ status: nextStatus, localRepos: nextLocalRepos });
      await Promise.all([
        useRackStore.getState().load(),
        useNodesStore.getState().load(),
        useGroupsStore.getState().load(),
        usePlaybookStore.getState().load(),
      ]);
      toast.success(`Switched to ${owner}/${repo}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to switch repo",
      );
    } finally {
      set({ switchingRepo: false });
    }
  },

  dropRepo: async (owner: string, repo: string) => {
    try {
      await dropLocalRepo(owner, repo);
      const [nextStatus, nextLocalRepos] = await Promise.all([
        getSetupStatus(),
        listLocalRepos().catch(() => []),
      ]);
      set({ status: nextStatus, localRepos: nextLocalRepos });
      await Promise.all([
        useRackStore.getState().load(),
        useNodesStore.getState().load(),
        useGroupsStore.getState().load(),
        usePlaybookStore.getState().load(),
      ]);
      toast.success(`Dropped ${owner}/${repo}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to drop repo",
      );
    }
  },

  openPublicKey: async () => {
    set({ publicKeyOpen: true });
    const { publicKey, loadingPublicKey } = get();
    if (publicKey || loadingPublicKey) return;
    set({ loadingPublicKey: true });
    try {
      const result = await fetchMachinePublicKey();
      set({ publicKey: result.public_key });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load public key",
      );
    } finally {
      set({ loadingPublicKey: false });
    }
  },

  setPublicKeyOpen: (open: boolean) => set({ publicKeyOpen: open }),
}));
