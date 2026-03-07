import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { NodeSummary } from "@/lib/nodes";

export type GroupInput = {
  name: string;
  description?: string;
};

export type Group = GroupInput & {
  slug: string;
};

export type GroupWithMembers = Group & {
  nodes: NodeSummary[];
};

export async function listGroups() {
  const data = await apiGet<{ groups: Group[] }>("/groups");
  return data.groups;
}

export async function getGroup(slug: string) {
  return apiGet<{ group: GroupWithMembers }>(`/groups/${slug}`);
}

export async function createGroup(payload: GroupInput) {
  return apiPost<{ group: Group }>("/groups", payload);
}

export async function updateGroup(slug: string, payload: GroupInput) {
  return apiPatch<{ group: Group }>(`/groups/${slug}`, payload);
}

export async function deleteGroup(slug: string) {
  return apiDelete(`/groups/${slug}`);
}
