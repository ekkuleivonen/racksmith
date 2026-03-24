import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { getDefaults } from "@/lib/defaults";
import { getScanStatus, type ScanStatus } from "@/lib/discovery";
import { getHost, listHosts, type ListHostsParams } from "@/lib/hosts";
import { hostStatusKey, type PingStatus } from "@/lib/ssh";
import { usePingStore } from "@/stores/ping";
import {
  listRacks,
  hostToLayoutHost,
  type RackLayoutHost,
  type RackSummary,
} from "@/lib/racks";
import { listGroups, getGroup } from "@/lib/groups";
import { listPlaybooks, getPlaybook } from "@/lib/playbooks";
import { getRoleDetail, getRoleFacets, listRoles } from "@/lib/roles";
import {
  getRegistryFacets,
  getRegistryPlaybook,
  getRegistryPlaybookFacets,
  getRegistryRole,
  listRegistryPlaybooks,
  listRecommendedRegistryRoles,
  listRegistryRoles,
  type ListRegistryPlaybooksParams,
  type ListRegistryRolesParams,
} from "@/lib/registry";
import { getCodeTree, getGitStatus } from "@/lib/files";
import { listSubnets } from "@/lib/subnets";

export type RackNavEntry = {
  rack: RackSummary;
  hosts: RackLayoutHost[];
};

function serializeHostsParams(params?: ListHostsParams): string {
  if (!params) return "all";
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    filtered[k] = v;
  }
  return Object.keys(filtered).length === 0 ? "all" : JSON.stringify(filtered);
}

export function useHosts(params?: ListHostsParams) {
  return useQuery({
    queryKey: [...queryKeys.hosts, serializeHostsParams(params)],
    queryFn: () => listHosts(params),
  });
}

export function useDefaults() {
  return useQuery({
    queryKey: queryKeys.defaults,
    queryFn: () => getDefaults(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useRoleFacets() {
  return useQuery({
    queryKey: [...queryKeys.roles, "facets"],
    queryFn: () => getRoleFacets(),
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

export function usePingStatus(hostId: string | undefined) {
  const status = usePingStore((s) =>
    hostId ? s.statuses[hostStatusKey(hostId)] : undefined,
  );
  return { data: status ?? ("unknown" as PingStatus) };
}

export function useRackEntries() {
  return useQuery({
    queryKey: [...queryKeys.racks, "entries"],
    queryFn: async () => {
      const [racks, hosts] = await Promise.all([listRacks(), listHosts()]);

      const hostsByRack = new Map<string, RackLayoutHost[]>();
      for (const h of hosts) {
        const lh = hostToLayoutHost(h);
        if (!lh) continue;
        const rackId = h.placement!.rack;
        const arr = hostsByRack.get(rackId);
        if (arr) arr.push(lh);
        else hostsByRack.set(rackId, [lh]);
      }

      const entries: RackNavEntry[] = racks.map((rack) => ({
        rack,
        hosts: hostsByRack.get(rack.id) ?? [],
      }));
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
    queryFn: () => getCodeTree(),
  });
}

export function useRegistryRoles(params: ListRegistryRolesParams = {}) {
  return useQuery({
    queryKey: [...queryKeys.registry, "list", params],
    queryFn: () => listRegistryRoles(params),
  });
}

export function useRegistryRole(id: string | null) {
  return useQuery({
    queryKey: [...queryKeys.registry, "role", id],
    queryFn: () => getRegistryRole(id!),
    enabled: !!id,
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

export function useRegistryPlaybook(id: string | null) {
  return useQuery({
    queryKey: [...queryKeys.registry, "playbook", id],
    queryFn: () => getRegistryPlaybook(id!),
    enabled: !!id,
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
  return useQuery({
    queryKey: [...queryKeys.registry, "recommended"],
    queryFn: () => listRecommendedRegistryRoles(),
    staleTime: 60_000,
  });
}

export function useGitStatuses() {
  return useQuery({
    queryKey: queryKeys.filesStatuses,
    queryFn: () => getGitStatus(),
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
