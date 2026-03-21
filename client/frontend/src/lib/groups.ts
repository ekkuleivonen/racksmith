import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { invalidateResource } from "@/lib/queryClient";
import type { HostSummary } from "@/lib/hosts";

export type GroupInput = {
  name: string;
  description?: string;
  vars?: Record<string, unknown>;
};

export type Group = GroupInput & {
  id: string;
  vars: Record<string, unknown>;
};

export type GroupWithMembers = Group & {
  hosts: HostSummary[];
};

function invalidateAfterGroupMutation() {
  invalidateResource("groups", "filesStatuses", "filesTree");
}

const GROUPS_PER_PAGE = 200;

export async function listGroups() {
  const data = await apiGet<{
    items: Group[];
    total: number;
    page: number;
    per_page: number;
  }>(`/groups?page=1&per_page=${GROUPS_PER_PAGE}`);
  return data.items;
}

export async function getGroup(id: string) {
  return apiGet<{ group: GroupWithMembers }>(`/groups/${id}`);
}

export async function createGroup(payload: GroupInput) {
  const result = await apiPost<{ group: GroupWithMembers }>("/groups", payload);
  invalidateAfterGroupMutation();
  return result;
}

export async function updateGroup(id: string, payload: GroupInput) {
  const result = await apiPatch<{ group: Group }>(`/groups/${id}`, payload);
  invalidateAfterGroupMutation();
  return result;
}

export async function deleteGroup(id: string) {
  await apiDelete(`/groups/${id}`);
  invalidateAfterGroupMutation();
}

export async function addGroupMembers(groupId: string, hostIds: string[]) {
  await apiPost(`/groups/${groupId}/members`, { host_ids: hostIds });
  invalidateAfterGroupMutation();
}

export async function removeGroupMember(groupId: string, hostId: string) {
  await apiDelete(`/groups/${groupId}/members/${hostId}`);
  invalidateAfterGroupMutation();
}
