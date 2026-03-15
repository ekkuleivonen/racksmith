import { create } from "zustand";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";
import {
  activateLocalRepo,
  dropLocalRepo,
  getSetupStatus,
  listLocalRepos,
  syncRepo as syncRepoApi,
  type LocalRepo,
  type SetupStatus,
} from "@/lib/setup";
import { fetchMachinePublicKey, generateMachineKey } from "@/lib/ssh";
import { queryClient } from "@/lib/queryClient";

type SetupStore = {
  status: SetupStatus | null;
  localRepos: LocalRepo[];
  loading: boolean;
  switchingRepo: boolean;
  syncing: boolean;
  publicKey: string;
  loadingPublicKey: boolean;
  generatingKey: boolean;
  publicKeyOpen: boolean;
  load: () => Promise<void>;
  switchRepo: (owner: string, repo: string) => Promise<void>;
  dropRepo: (owner: string, repo: string) => Promise<void>;
  syncRepo: () => Promise<void>;
  openPublicKey: () => Promise<void>;
  generateKey: () => Promise<void>;
  setPublicKeyOpen: (open: boolean) => void;
};

export const useSetupStore = create<SetupStore>((set, get) => ({
  status: null,
  localRepos: [],
  loading: true,
  switchingRepo: false,
  syncing: false,
  publicKey: "",
  loadingPublicKey: false,
  generatingKey: false,
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
      await queryClient.refetchQueries();
      toast.success(`Switched to ${owner}/${repo}`);
    } catch (error) {
      toastApiError(error, "Failed to switch repo");
    } finally {
      set({ switchingRepo: false });
    }
  },

  syncRepo: async () => {
    set({ syncing: true });
    try {
      await syncRepoApi();
      const [nextStatus, nextLocalRepos] = await Promise.all([
        getSetupStatus(),
        listLocalRepos().catch(() => []),
      ]);
      set({ status: nextStatus, localRepos: nextLocalRepos });
      await queryClient.refetchQueries();
      toast.success("Repo synced");
    } catch (error) {
      toastApiError(error, "Failed to sync repo");
    } finally {
      set({ syncing: false });
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
      await queryClient.refetchQueries();
      toast.success(`Dropped ${owner}/${repo}`);
    } catch (error) {
      toastApiError(error, "Failed to drop repo");
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
      toastApiError(error, "Failed to load public key");
    } finally {
      set({ loadingPublicKey: false });
    }
  },

  generateKey: async () => {
    set({ generatingKey: true });
    try {
      const result = await generateMachineKey();
      set({ publicKey: result.public_key });
    } catch (error) {
      toastApiError(error, "Failed to generate key");
    } finally {
      set({ generatingKey: false });
    }
  },

  setPublicKeyOpen: (open: boolean) => set({ publicKeyOpen: open }),
}));
