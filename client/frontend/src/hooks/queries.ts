import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { getScanStatus, type ScanStatus } from "@/lib/discovery";
import { getHost, listHosts, type Host } from "@/lib/hosts";
import { fetchPingStatuses, hostStatusKey, type PingStatus } from "@/lib/ssh";
import { usePingStore } from "@/stores/ping";
import { listRacks, getRackLayout, type RackSummary } from "@/lib/racks";
import { listGroups, getGroup } from "@/lib/groups";
import { listPlaybooks, getPlaybook } from "@/lib/playbooks";
import { getRoleDetail, listRoles } from "@/lib/roles";
import {
  getRegistryFacets,
  getRegistryPlaybook,
  getRegistryPlaybookFacets,
  getRegistryRole,
  listRegistryPlaybooks,
  listRegistryRoles,
  type ListRegistryPlaybooksParams,
  type ListRegistryRolesParams,
} from "@/lib/registry";
import { apiGet } from "@/lib/api";
import { listSubnets } from "@/lib/subnets";
import type { TreeEntry } from "@/components/files/file-tree";

export type RackNavEntry = {
  rack: RackSummary;
  hosts: Host[];
};

export function useHosts() {
  return useQuery({
    queryKey: queryKeys.hosts,
    queryFn: () => listHosts(),
  });
}

export function useHost(hostId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.hosts, hostId],
    queryFn: async () => {
      const { host } = await getHost(hostId!);
      return host;
    },
    enabled: !!hostId,
  });
}

export function usePingStatus(hostId: string | undefined, hasIp: boolean) {
  const storeStatus = usePingStore((s) =>
    hostId ? s.statuses[hostStatusKey(hostId)] : undefined,
  );

  return useQuery<PingStatus>({
    queryKey: queryKeys.ping(hostId!),
    queryFn: async () => {
      const response = await fetchPingStatuses([{ host_id: hostId! }]);
      return response.statuses[0]?.status ?? "unknown";
    },
    enabled: !!hostId && hasIp,
    refetchInterval: 10_000,
    initialData: storeStatus ?? "unknown",
  });
}

export function useRackEntries() {
  return useQuery({
    queryKey: queryKeys.racks,
    queryFn: async () => {
      const racks = await listRacks();
      const entries: RackNavEntry[] = await Promise.all(
        racks.map(async (rack) => {
          const { layout } = await getRackLayout(rack.id);
          return { rack, hosts: layout.hosts };
        }),
      );
      return entries;
    },
  });
}

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => listGroups(),
  });
}

export function useGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.groups, groupId],
    queryFn: async () => {
      const { group } = await getGroup(groupId!);
      return group;
    },
    enabled: !!groupId,
  });
}

export function usePlaybooks() {
  return useQuery({
    queryKey: queryKeys.playbooks,
    queryFn: async () => {
      const result = await listPlaybooks();
      return result.playbooks;
    },
  });
}

export function usePlaybook(playbookId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.playbooks, playbookId],
    queryFn: async () => {
      const { playbook } = await getPlaybook(playbookId!);
      return playbook;
    },
    enabled: !!playbookId,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: queryKeys.roles,
    queryFn: () => listRoles(),
  });
}

export function useRoleDetail(roleId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.roleDetail(roleId!),
    queryFn: async () => {
      const { role } = await getRoleDetail(roleId!);
      return role;
    },
    enabled: !!roleId,
  });
}

export function useCodeTree() {
  return useQuery({
    queryKey: queryKeys.filesTree,
    queryFn: async () => {
      const data = await apiGet<{ entries: TreeEntry[] }>("/files/tree");
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

export function useRegistryFacets() {
  return useQuery({
    queryKey: [...queryKeys.registry, "facets"],
    queryFn: () => getRegistryFacets(),
    staleTime: 60_000,
  });
}

export function useRegistryPlaybooks(
  params: ListRegistryPlaybooksParams = {},
) {
  return useQuery({
    queryKey: [...queryKeys.registry, "playbooks", "list", params],
    queryFn: () => listRegistryPlaybooks(params),
  });
}

export function useRegistryPlaybook(slug: string | null) {
  return useQuery({
    queryKey: [...queryKeys.registry, "playbook", slug],
    queryFn: () => getRegistryPlaybook(slug!),
    enabled: !!slug,
  });
}

export function useRegistryPlaybookFacets() {
  return useQuery({
    queryKey: [...queryKeys.registry, "playbook-facets"],
    queryFn: () => getRegistryPlaybookFacets(),
    staleTime: 60_000,
  });
}

export function useRecommendedRoles() {
  const { data: hosts } = useHosts();
  const osFamilies = [
    ...new Set(
      (hosts ?? [])
        .map((h) => h.os_family)
        .filter((f): f is string => !!f),
    ),
  ];
  const platformsParam = osFamilies.join(",");

  return useQuery({
    queryKey: [...queryKeys.registry, "recommended", platformsParam],
    queryFn: () =>
      listRegistryRoles({
        platforms: platformsParam,
        sort: "downloads",
        per_page: 6,
      }),
    enabled: osFamilies.length > 0,
    staleTime: 60_000,
  });
}

export function useGitStatuses() {
  return useQuery({
    queryKey: queryKeys.filesStatuses,
    queryFn: async (): Promise<GitStatuses> => {
      const data = await apiGet<{
        modified_paths: string[];
        untracked_paths: string[];
      }>("/files/file-statuses");
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

export function useSubnets() {
  return useQuery({
    queryKey: queryKeys.subnets,
    queryFn: () => listSubnets(),
  });
}

export function useDiscoveryScan(scanId: string | null) {
  return useQuery<ScanStatus>({
    queryKey: [...queryKeys.discovery, scanId],
    queryFn: () => getScanStatus(scanId!),
    enabled: !!scanId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "pending" || status === "running") return 1500;
      return false;
    },
  });
}
