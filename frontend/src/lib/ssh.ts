import { apiGet, apiPost } from "@/lib/api";

export type CommandHistoryEntry = {
  command: string;
  created_at: string;
  item_id: string;
  item_name: string;
  host: string;
};

export type PingStatus = "online" | "offline" | "unknown";

export type PingStatusTarget = {
  rack_id: string;
  item_id: string;
};

export type PingStatusEntry = PingStatusTarget & {
  status: PingStatus;
};

export function itemStatusKey(rackId: string, itemId: string) {
  return `${rackId}:${itemId}`;
}

export async function fetchCommandHistory(rackId: string, itemId: string) {
  return apiGet<{ history: CommandHistoryEntry[] }>(`/ssh/racks/${rackId}/items/${itemId}/history`);
}

export async function rebootRackItem(rackId: string, itemId: string) {
  return apiPost<{ status: string }>(`/ssh/racks/${rackId}/items/${itemId}/reboot`);
}

export async function fetchPingStatuses(targets: PingStatusTarget[]) {
  return apiPost<{ statuses: PingStatusEntry[] }>("/ssh/ping-status", { targets });
}

export async function fetchMachinePublicKey() {
  return apiGet<{ public_key: string }>("/ssh/public-key");
}

export function sshTerminalUrl(rackId: string, itemId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/ssh/racks/${rackId}/items/${itemId}/terminal`;
}
