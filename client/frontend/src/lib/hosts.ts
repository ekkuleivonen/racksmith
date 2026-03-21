import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { invalidateResource } from "@/lib/queryClient";
import { hostStatusKey } from "@/lib/ssh";
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
  /** Subnet CIDR from repo meta when the host IP falls in a configured subnet */
  subnet?: string | null;
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

/** Group hosts in the network view — uses backend-derived subnet when available */
export function hostSubnetBucket(host: Host): string {
  return host.subnet?.trim() || "unknown";
}

export type ListHostsParams = {
  q?: string;
  group?: string[];
  label?: string[];
  subnet?: string[];
  managed?: boolean;
  sort?: string;
  order?: "asc" | "desc";
};

export function canvasToListHostsParams(
  filters: CanvasFilters,
  sort?: { column: string; dir: "asc" | "desc" },
): ListHostsParams {
  const sortMap: Record<string, string> = {
    name: "name",
    ip: "ip",
    user: "ssh_user",
    os: "os_family",
    labels: "labels",
    status: "name",
  };
  const p: ListHostsParams = {
    q: filters.search.trim() || undefined,
    group: filters.groups.length > 0 ? filters.groups : undefined,
    label: filters.labels.length > 0 ? filters.labels : undefined,
    subnet: filters.subnets.length > 0 ? filters.subnets : undefined,
    managed: true,
  };
  if (sort) {
    const col = sort.column;
    p.sort = sortMap[col] ?? "name";
    p.order = sort.dir;
  }
  return p;
}

export function matchesStatusFilter(
  host: Host,
  statusFilters: string[],
  pingStatuses: Record<string, string>,
): boolean {
  if (statusFilters.length === 0) return true;
  const status = pingStatuses[hostStatusKey(host.id)] ?? "unknown";
  return statusFilters.includes(status);
}

/** Canvas filtering (search, groups, labels, status, subnet) — subnet uses backend `host.subnet`. */
export function matchesCanvasHostFilters(
  host: Host,
  filters: CanvasFilters,
  pingStatuses: Record<string, string>,
): boolean {
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const searchable = [
      host.name,
      host.hostname,
      host.ip_address,
      host.os_family,
      ...(host.labels ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!searchable.includes(q)) return false;
  }
  if (filters.groups.length > 0) {
    if (!filters.groups.some((g) => (host.groups ?? []).includes(g))) return false;
  }
  if (filters.labels.length > 0) {
    if (!filters.labels.some((l) => (host.labels ?? []).includes(l))) return false;
  }
  if (!matchesStatusFilter(host, filters.status, pingStatuses)) return false;
  if (filters.subnets.length > 0) {
    const bucket = host.subnet?.trim() || "unknown";
    if (!filters.subnets.includes(bucket)) return false;
  }
  return true;
}

function invalidateAfterHostMutation() {
  invalidateResource("hosts", "racks", "filesStatuses", "filesTree");
}

/** Keep <= backend `list_hosts` per_page max (older deployments use 200). */
const HOSTS_PAGE_SIZE = 200;

export async function listHosts(params?: ListHostsParams) {
  const all: Host[] = [];
  let page = 1;
  while (true) {
    const sp = new URLSearchParams();
    sp.set("page", String(page));
    sp.set("per_page", String(HOSTS_PAGE_SIZE));
    if (params?.q) sp.set("q", params.q);
    if (params?.group?.length) sp.set("group", params.group.join(","));
    if (params?.label?.length) sp.set("label", params.label.join(","));
    if (params?.subnet?.length) sp.set("subnet", params.subnet.join(","));
    if (params?.managed !== undefined) sp.set("managed", String(params.managed));
    if (params?.sort) sp.set("sort", params.sort);
    if (params?.order) sp.set("order", params.order);
    const data = await apiGet<{
      items: Host[];
      total: number;
      page: number;
      per_page: number;
    }>(`/hosts?${sp.toString()}`);
    all.push(...data.items);
    const got = data.items.length;
    if (got < HOSTS_PAGE_SIZE || all.length >= data.total) break;
    page += 1;
  }
  return all;
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

export type RelocateResponse = {
  host: Host;
  previous_ip: string;
  new_ip: string;
  changed: boolean;
};

export async function relocateHost(id: string, subnet?: string) {
  const result = await apiPost<RelocateResponse>(`/hosts/${id}/relocate`, {
    subnet: subnet ?? null,
  });
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

export type DiscoveredDeviceInput = {
  ip: string;
  mac?: string;
  hostname?: string;
};

export async function bulkImportDiscovered(
  devices: DiscoveredDeviceInput[],
  sshUser: string,
  sshPort: number,
) {
  const result = await apiPost<{ hosts: Host[] }>(
    "/hosts/bulk/import-discovered",
    {
      devices,
      ssh_user: sshUser,
      ssh_port: sshPort,
    },
  );
  invalidateAfterHostMutation();
  return result.hosts;
}
