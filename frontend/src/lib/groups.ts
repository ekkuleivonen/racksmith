import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { queryClient, queryKeys } from "@/lib/queryClient";
import type { NodeSummary } from "@/lib/nodes";

export type GroupInput = {
  name: string;
  description?: string;
};

export type Group = GroupInput & {
  id: string;
};

export type GroupWithMembers = Group & {
  nodes: NodeSummary[];
};

function invalidateAfterGroupMutation() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.groups });
  void queryClient.invalidateQueries({ queryKey: queryKeys.codeStatuses });
  void queryClient.invalidateQueries({ queryKey: queryKeys.codeTree });
}

export async function listGroups() {
  const data = await apiGet<{ groups: Group[] }>("/groups");
  return data.groups;
}

export async function getGroup(id: string) {
  return apiGet<{ group: GroupWithMembers }>(`/groups/${id}`);
}

export async function createGroup(payload: GroupInput) {
  const result = await apiPost<{ group: Group }>("/groups", payload);
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
