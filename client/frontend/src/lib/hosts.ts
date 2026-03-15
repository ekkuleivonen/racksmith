import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { invalidateResource } from "@/lib/queryClient";
import { hostStatusKey } from "@/lib/ssh";
import { getSubnetCidr } from "@/lib/subnets";
import type { CanvasFilters } from "@/hooks/use-canvas-params";

export type HostPlacement = {
  rack: string;
  u_start: number;
  u_height?: number;
  col_start?: number;
  col_count?: number;
};

export type HostInput = {
  name?: string;
  ip_address?: string;
  ssh_user?: string;
  ssh_port?: number;
  managed?: boolean;
  groups?: string[];
  labels?: string[];
  os_family?: string | null;
  placement?: HostPlacement | null;
  vars?: Record<string, unknown>;
};

export type Host = HostInput & {
  id: string;
  hostname?: string;
  mac_address?: string;
  vars: Record<string, unknown>;
};

export type HostSummary = {
  id: string;
  name: string;
  hostname: string;
  ip_address: string;
  managed: boolean;
  groups: string[];
  labels: string[];
};

export function hostAlias(host: Host | HostSummary): string {
  return (
    host.name?.trim().toLowerCase().replace(/\s+/g, "-") ||
    host.hostname ||
    host.ip_address ||
    host.id
  );
}

/** Display label for a host: name → hostname → ip_address → id */
export function hostDisplayLabel(host: { id: string; name?: string; hostname?: string; ip_address?: string }): string {
  return host.name?.trim() || host.hostname || host.ip_address || host.id;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Sort key: name → hostname → ip_address → mac_address → id */
function hostSortKey(host: Host): string {
  return host.name?.trim() || host.hostname || host.ip_address || host.mac_address || host.id;
}

export function compareHosts(a: Host, b: Host): number {
  return collator.compare(hostSortKey(a), hostSortKey(b));
}

export function isReachableHost(host: {
  ip_address?: string;
  ssh_user?: string;
}): boolean {
  return !!host.ip_address && !!host.ssh_user;
}

export function isManagedHost(host: Host | HostSummary): boolean {
  return host.managed ?? false;
}

export function matchesHostFilters(
  host: Host,
  filters: CanvasFilters,
  pingStatuses: Record<string, string>,
): boolean {
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const searchable = [host.name, host.hostname, host.ip_address, host.os_family, ...(host.labels ?? [])]
      .filter(Boolean).join(" ").toLowerCase();
    if (!searchable.includes(q)) return false;
  }
  if (filters.groups.length > 0) {
    if (!filters.groups.some((g) => (host.groups ?? []).includes(g))) return false;
  }
  if (filters.labels.length > 0) {
    if (!filters.labels.some((l) => (host.labels ?? []).includes(l))) return false;
  }
  if (filters.status.length > 0) {
    const status = pingStatuses[hostStatusKey(host.id)] ?? "unknown";
    if (!filters.status.includes(status)) return false;
  }
  if (filters.subnets.length > 0) {
    if (!filters.subnets.includes(getSubnetCidr(host.ip_address))) return false;
  }
  return true;
}

function invalidateAfterHostMutation() {
  invalidateResource("hosts", "racks", "filesStatuses", "filesTree");
}

export async function listHosts() {
  const data = await apiGet<{ hosts: Host[] }>("/hosts");
  return data.hosts;
}

export async function getHost(id: string) {
  return apiGet<{ host: Host }>(`/hosts/${id}`);
}

export async function createHost(payload: HostInput) {
  const result = await apiPost<{ host: Host }>("/hosts", payload);
  invalidateAfterHostMutation();
  return result;
}

export async function createHostsBulk(hosts: HostInput[]) {
  const result = await apiPost<{ hosts: Host[] }>("/hosts/bulk/create", {
    hosts,
  });
  invalidateAfterHostMutation();
  return result;
}

export async function updateHost(id: string, payload: HostInput) {
  const result = await apiPatch<{ host: Host }>(`/hosts/${id}`, payload);
  invalidateAfterHostMutation();
  return result;
}

export async function deleteHost(id: string) {
  await apiDelete(`/hosts/${id}`);
  invalidateAfterHostMutation();
}

export async function refreshHost(id: string) {
  const result = await apiPost<{ host: Host }>(`/hosts/${id}/refresh`);
  invalidateAfterHostMutation();
  return result;
}

export async function previewHost(payload: HostInput) {
  return apiPost<{ host: Host }>("/hosts/preview", payload);
}

export async function bulkAddToGroup(hostIds: string[], groupId: string) {
  const result = await apiPost<{ updated: number }>(
    "/hosts/bulk/add-to-group",
    { host_ids: hostIds, group_id: groupId },
  );
  invalidateAfterHostMutation();
  return result;
}

export async function bulkAddLabel(hostIds: string[], label: string) {
  const result = await apiPost<{ updated: number }>(
    "/hosts/bulk/add-label",
    { host_ids: hostIds, label },
  );
  invalidateAfterHostMutation();
  return result;
}
