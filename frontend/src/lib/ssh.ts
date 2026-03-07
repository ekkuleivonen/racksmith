import { apiGet, apiPost } from "@/lib/api";

export type CommandHistoryEntry = {
  command: string;
  created_at: string;
  node_slug: string;
  node_name: string;
  host: string;
};

export type PingStatus = "online" | "offline" | "unknown";

export type PingStatusTarget = {
  node_slug: string;
};

export type PingStatusEntry = PingStatusTarget & {
  status: PingStatus;
};

export function nodeStatusKey(nodeSlug: string) {
  return nodeSlug;
}

export async function fetchCommandHistory(nodeSlug: string) {
  return apiGet<{ history: CommandHistoryEntry[] }>(`/ssh/nodes/${nodeSlug}/history`);
}

export async function rebootNode(nodeSlug: string) {
  return apiPost<{ status: string }>(`/ssh/nodes/${nodeSlug}/reboot`);
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

export function sshTerminalUrl(nodeSlug: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/ssh/nodes/${nodeSlug}/terminal`;
}
