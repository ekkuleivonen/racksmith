import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { queryClient, queryKeys } from "@/lib/queryClient";

export type NodePlacement = {
  rack: string;
  u_start: number;
  u_height?: number;
  col_start?: number;
  col_count?: number;
};

export type NodeInput = {
  name: string;
  ip_address?: string;
  ssh_user?: string;
  ssh_port?: number;
  managed?: boolean;
  groups?: string[];
  labels?: string[];
  os_family?: string | null;
  notes?: string;
  placement?: NodePlacement | null;
};

export type Node = NodeInput & {
  id: string;
  hostname?: string;
  mac_address?: string;
};

export type NodeSummary = {
  id: string;
  name: string;
  hostname: string;
  ip_address: string;
  managed: boolean;
  groups: string[];
  labels: string[];
  reachable?: boolean | null;
};

export function nodeAlias(node: Node | NodeSummary): string {
  return (
    node.name?.trim().toLowerCase().replace(/\s+/g, "-") ||
    node.hostname ||
    node.ip_address ||
    node.id
  );
}

export function isReachableNode(node: { ip_address?: string; ssh_user?: string }): boolean {
  return !!node.ip_address && !!node.ssh_user;
}

export function isManagedNode(node: Node | NodeSummary): boolean {
  return node.managed ?? false;
}

function invalidateAfterNodeMutation() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.nodes });
  void queryClient.invalidateQueries({ queryKey: queryKeys.racks });
  void queryClient.invalidateQueries({ queryKey: queryKeys.codeStatuses });
  void queryClient.invalidateQueries({ queryKey: queryKeys.codeTree });
}

export async function listNodes() {
  const data = await apiGet<{ nodes: Node[] }>("/nodes");
  return data.nodes;
}

export async function getNode(id: string) {
  return apiGet<{ node: Node }>(`/nodes/${id}`);
}

export async function createNode(payload: NodeInput) {
  const result = await apiPost<{ node: Node }>("/nodes", payload);
  invalidateAfterNodeMutation();
  return result;
}

export async function updateNode(id: string, payload: NodeInput) {
  const result = await apiPatch<{ node: Node }>(`/nodes/${id}`, payload);
  invalidateAfterNodeMutation();
  return result;
}

export async function deleteNode(id: string) {
  await apiDelete(`/nodes/${id}`);
  invalidateAfterNodeMutation();
}

export async function refreshNode(id: string) {
  const result = await apiPost<{ node: Node }>(`/nodes/${id}/refresh`);
  invalidateAfterNodeMutation();
  return result;
}

export async function previewNode(payload: NodeInput) {
  return apiPost<{ node: Node }>("/nodes/preview", payload);
}
