import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

export type RackWidthInches = 10 | 19;

export const COLS_BY_WIDTH: Record<RackWidthInches, number> = {
  19: 12,
  10: 6,
};

export type RackItemPlacement = "rack" | "parked";

export type RackSummary = {
  id: string;
  name: string;
  rack_width_inches: RackWidthInches;
  rack_units: number;
  rack_cols: number;
  created_at: string;
  item_count: number;
};

export type RackItem = {
  id: string;
  placement: RackItemPlacement;
  managed: boolean;
  position_u_start: number;
  position_u_height: number;
  position_col_start: number;
  position_col_count: number;
  host: string;
  name: string;
  mac_address: string;
  os: string;
  ssh_user: string;
  ssh_port: number;
  tags: string[];
};

export type RackDetail = {
  id: string;
  name: string;
  rack_width_inches: RackWidthInches;
  rack_units: number;
  rack_cols: number;
  created_at: string;
  updated_at: string;
};

export type ZoneSelection = {
  startU: number;
  heightU: number;
  startCol: number;
  colCount: number;
};

export function rackItemAlias(item: RackItem): string {
  return item.name.trim().toLowerCase().replace(/\s+/g, "-") || item.host || item.id;
}

export function isReachableRackItem(item: RackItem): boolean {
  return !!item.host && !!item.ssh_user;
}

export function isPlacedRackItem(item: RackItem): boolean {
  return item.placement === "rack";
}

export function isManagedRackItem(item: RackItem): boolean {
  return item.managed;
}

export async function listRacks() {
  const data = await apiGet<{ racks: RackSummary[] }>("/racks");
  return data.racks;
}

export async function getRack(rackId: string) {
  return apiGet<{ rack: RackDetail; items: RackItem[] }>(`/racks/${rackId}`);
}

export async function createRack(payload: {
  name: string;
  rack_width_inches: RackWidthInches;
  rack_units: number;
  rack_cols: number;
  items: RackItem[];
}) {
  return apiPost<{ rack: RackDetail; rack_id: string }>("/racks", payload);
}

export async function updateRack(
  rackId: string,
  payload: Partial<{
    name: string;
    rack_width_inches: RackWidthInches;
    rack_units: number;
    rack_cols: number;
    park_all_items: boolean;
  }>
) {
  return apiPatch<{ rack: RackDetail }>(`/racks/${rackId}`, payload);
}

export async function deleteRack(rackId: string) {
  return apiDelete(`/racks/${rackId}`);
}

export async function addRackItem(rackId: string, payload: RackItem) {
  return apiPost<{ item: RackItem }>(`/racks/${rackId}/items`, payload);
}

export async function previewRackItem(payload: RackItem & { rack_units: number; rack_cols: number }) {
  return apiPost<{ item: RackItem }>("/racks/preview-item", {
    item_id: payload.id,
    placement: payload.placement,
    managed: payload.managed,
    rack_units: payload.rack_units,
    rack_cols: payload.rack_cols,
    name: payload.name,
    position_u_start: payload.position_u_start,
    position_u_height: payload.position_u_height,
    position_col_start: payload.position_col_start,
    position_col_count: payload.position_col_count,
    host: payload.host,
    os: payload.os,
    ssh_user: payload.ssh_user,
    ssh_port: payload.ssh_port,
    tags: payload.tags,
  });
}

export async function updateRackItem(rackId: string, itemId: string, payload: Partial<RackItem>) {
  return apiPatch<{ item: RackItem }>(`/racks/${rackId}/items/${itemId}`, payload);
}

export async function refreshRackItem(rackId: string, itemId: string) {
  return apiPost<{ item: RackItem }>(`/racks/${rackId}/items/${itemId}/refresh`);
}

export async function deleteRackItem(rackId: string, itemId: string) {
  return apiDelete(`/racks/${rackId}/items/${itemId}`);
}
