import { apiGet, apiPost } from "@/lib/api";

export type CommandHistoryEntry = {
  command: string;
  created_at: string;
  node_id: string;
  node_name: string;
  host: string;
};

export type PingStatus = "online" | "offline" | "unknown";

export type PingStatusTarget = {
  node_id: string;
};

export type PingStatusEntry = PingStatusTarget & {
  status: PingStatus;
};

export function nodeStatusKey(nodeId: string) {
  return nodeId;
}

export async function fetchCommandHistory(nodeId: string) {
  return apiGet<{ history: CommandHistoryEntry[] }>(`/ssh/nodes/${nodeId}/history`);
}

export async function rebootNode(nodeId: string) {
  return apiPost<{ status: string }>(`/ssh/nodes/${nodeId}/reboot`);
}

export async function fetchPingStatuses(targets: PingStatusTarget[]) {
  return apiPost<{ statuses: PingStatusEntry[] }>("/ssh/ping-status", { targets });
}

export async function fetchMachinePublicKey() {
  return apiGet<{ public_key: string }>("/ssh/public-key");
}

export async function generateMachineKey() {
  return apiPost<{ public_key: string }>("/ssh/generate-key");
}

export function sshTerminalUrl(nodeId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/ssh/nodes/${nodeId}/terminal`;
}
