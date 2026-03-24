import { apiGet, apiPost } from "@/lib/api";

export type DiscoveredDevice = {
  ip: string;
  mac?: string;
  hostname: string;
  already_imported: boolean;
  existing_host_id: string | null;
};

export type ScanStatus = {
  scan_id: string;
  status: "pending" | "running" | "completed" | "failed" | "not_found";
  devices: DiscoveredDevice[];
  subnet: string;
  error: string | null;
};

type ScanResponse = {
  scan_id: string;
};

export async function startScan(subnet?: string): Promise<ScanResponse> {
  return apiPost<ScanResponse>("/daemon/discovery", { subnet: subnet || null });
}

export async function getScanStatus(scanId: string): Promise<ScanStatus> {
  return apiGet<ScanStatus>(`/daemon/discovery/${scanId}`);
}
