import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { queryClient, queryKeys } from "@/lib/queryClient";

export type HostPlacement = {
  rack: string;
  u_start: number;
  u_height?: number;
  col_start?: number;
  col_count?: number;
};

export type HostInput = {
  name: string;
  ip_address?: string;
  ssh_user?: string;
  ssh_port?: number;
  managed?: boolean;
  groups?: string[];
  labels?: string[];
  os_family?: string | null;
  notes?: string;
  placement?: HostPlacement | null;
};

export type Host = HostInput & {
  id: string;
  hostname?: string;
  mac_address?: string;
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
export function hostDisplayLabel(host: Host | HostSummary): string {
  return host.name?.trim() || host.hostname || host.ip_address || host.id;
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

function invalidateAfterHostMutation() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.hosts });
  void queryClient.invalidateQueries({ queryKey: queryKeys.racks });
  void queryClient.invalidateQueries({ queryKey: queryKeys.codeStatuses });
  void queryClient.invalidateQueries({ queryKey: queryKeys.codeTree });
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
