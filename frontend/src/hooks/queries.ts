import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { listHosts } from "@/lib/hosts";
import { listRacks, getRackLayout } from "@/lib/racks";
import { listGroups } from "@/lib/groups";
import { listPlaybooks } from "@/lib/playbooks";
import {
  getRegistryRole,
  getRegistryRoleVersions,
  listRegistryRoles,
  type ListRegistryRolesParams,
} from "@/lib/registry";
import { apiGet } from "@/lib/api";
import type { Host } from "@/lib/hosts";
import type { RackSummary } from "@/lib/racks";
import type { Group } from "@/lib/groups";
import type { TreeEntry } from "@/components/code/file-tree";

export type RackNavEntry = {
  rack: RackSummary;
  hosts: Host[];
};

export function useHosts() {
  return useQuery({
    queryKey: queryKeys.hosts,
    queryFn: () => listHosts().catch(() => [] as Host[]),
  });
}

export function useRackEntries() {
  return useQuery({
    queryKey: queryKeys.racks,
    queryFn: async () => {
      const racks = await listRacks().catch(() => [] as RackSummary[]);
      const entries: RackNavEntry[] = await Promise.all(
        racks.map(async (rack) => {
          const { layout } = await getRackLayout(rack.id);
          return { rack, hosts: layout.hosts.filter((n) => n.managed) };
        }),
      );
      return entries;
    },
  });
}

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => listGroups().catch(() => [] as Group[]),
  });
}

export function usePlaybooks() {
  return useQuery({
    queryKey: queryKeys.playbooks,
    queryFn: async () => {
      const result = await listPlaybooks().catch(() => ({
        playbooks: [],
        roles: [],
      }));
      return result.playbooks;
    },
  });
}

export function useCodeTree() {
  return useQuery({
    queryKey: queryKeys.codeTree,
    queryFn: async () => {
      const data = await apiGet<{ entries: TreeEntry[] }>("/code/tree");
      return data.entries;
    },
  });
}

type GitStatuses = {
  modifiedPaths: Record<string, true>;
  untrackedPaths: Record<string, true>;
};

export function useRegistryRoles(params: ListRegistryRolesParams = {}) {
  return useQuery({
    queryKey: [...queryKeys.registry, "list", params],
    queryFn: () => listRegistryRoles(params),
  });
}

export function useRegistryRole(slug: string | null) {
  return useQuery({
    queryKey: [...queryKeys.registry, "role", slug],
    queryFn: () => getRegistryRole(slug!),
    enabled: !!slug,
  });
}

export function useRegistryRoleVersions(slug: string | null) {
  return useQuery({
    queryKey: [...queryKeys.registry, "role", slug, "versions"],
    queryFn: () => getRegistryRoleVersions(slug!),
    enabled: !!slug,
  });
}

export function useGitStatuses() {
  return useQuery({
    queryKey: queryKeys.codeStatuses,
    queryFn: async (): Promise<GitStatuses> => {
      const data = await apiGet<{
        modified_paths: string[];
        untracked_paths: string[];
      }>("/code/file-statuses");
      return {
        modifiedPaths: Object.fromEntries(
          data.modified_paths.map((p) => [p, true as const]),
        ),
        untrackedPaths: Object.fromEntries(
          data.untracked_paths.map((p) => [p, true as const]),
        ),
      };
    },
  });
}
