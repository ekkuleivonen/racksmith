import { apiGet, apiPost, wsUrl } from "@/lib/api";

export type CommandHistoryEntry = {
  command: string;
  created_at: string;
  host_id: string;
  host_name: string;
  ip_address: string;
};

export type PingStatus = "online" | "offline" | "unknown";

export type PingStatusTarget = {
  host_id: string;
};

export type PingStatusEntry = PingStatusTarget & {
  status: PingStatus;
};

export function hostStatusKey(hostId: string) {
  return hostId;
}

export async function fetchCommandHistory(hostId: string) {
  return apiGet<{ history: CommandHistoryEntry[] }>(
    `/daemon/ssh/hosts/${hostId}/history`,
  );
}

export async function rebootHost(hostId: string) {
  return apiPost<{ status: string }>(`/daemon/ssh/hosts/${hostId}/reboot`);
}

export async function fetchPingStatuses(targets: PingStatusTarget[]) {
  return apiPost<{ statuses: PingStatusEntry[] }>("/daemon/ssh/ping-status", {
    targets,
  });
}

export async function fetchMachinePublicKey() {
  return apiGet<{ public_key: string }>("/daemon/ssh/public-key");
}

export async function generateMachineKey() {
  return apiPost<{ public_key: string }>("/daemon/ssh/generate-key");
}

export function sshTerminalUrl(hostId: string) {
  return wsUrl(`/daemon/ssh/hosts/${hostId}/terminal`);
}
