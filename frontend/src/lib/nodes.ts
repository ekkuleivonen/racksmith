import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

export type NodePlacement = {
  rack: string;
  u_start: number;
  u_height?: number;
  col_start?: number;
  col_count?: number;
};

export type NodeInput = {
  name: string;
  host?: string;
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
  host: string;
  managed: boolean;
  groups: string[];
  labels: string[];
  reachable?: boolean | null;
};

export function nodeAlias(node: Node | NodeSummary): string {
  return (
    node.name?.trim().toLowerCase().replace(/\s+/g, "-") ||
    node.hostname ||
    node.host ||
    node.id
  );
}

export function isReachableNode(node: { host?: string; ssh_user?: string }): boolean {
  return !!node.host && !!node.ssh_user;
}

export function isManagedNode(node: Node | NodeSummary): boolean {
  return node.managed ?? false;
}

export async function listNodes() {
  const data = await apiGet<{ nodes: Node[] }>("/nodes");
  return data.nodes;
}

export async function getNode(id: string) {
  return apiGet<{ node: Node }>(`/nodes/${id}`);
}

export async function createNode(payload: NodeInput) {
  return apiPost<{ node: Node }>("/nodes", payload);
}

export async function updateNode(id: string, payload: NodeInput) {
  return apiPatch<{ node: Node }>(`/nodes/${id}`, payload);
}

export async function deleteNode(id: string) {
  return apiDelete(`/nodes/${id}`);
}

export async function refreshNode(id: string) {
  return apiPost<{ node: Node }>(`/nodes/${id}/refresh`);
}

export async function previewNode(payload: NodeInput) {
  return apiPost<{ node: Node }>("/nodes/preview", payload);
}
