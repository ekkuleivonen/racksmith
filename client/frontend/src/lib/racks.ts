import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { invalidateResource } from "@/lib/queryClient";
import type { Host } from "@/lib/hosts";

export type RackWidthInches = 10 | 19;

/** Canvas-compatible host shape (flat placement fields). Layout only has hosts on the rack. */
export type RackLayoutHost = Omit<Host, "placement"> & {
  placement: "rack";
  position_u_start: number;
  position_u_height: number;
  position_col_start: number;
  position_col_count: number;
};

export function hostToRackLayoutHost(host: Host): RackLayoutHost {
  const p = host.placement!;
  return {
    ...host,
    placement: "rack",
    position_u_start: p.u_start ?? 1,
    position_u_height: p.u_height ?? 1,
    position_col_start: p.col_start ?? 0,
    position_col_count: p.col_count ?? 1,
  };
}

export const COLS_BY_WIDTH: Record<RackWidthInches, number> = {
  19: 12,
  10: 6,
};

export type RackSummary = {
  id: string;
  name: string;
  rack_width_inches: RackWidthInches;
  rack_units: number;
  rack_cols: number;
  created_at: string;
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

export type RackLayout = RackDetail & {
  hosts: Host[];
};

export type ZoneSelection = {
  startU: number;
  heightU: number;
  startCol: number;
  colCount: number;
};

function invalidateAfterRackMutation() {
  invalidateResource("racks", "filesTree");
}

export async function listRacks() {
  const data = await apiGet<{ racks: RackSummary[] }>("/racks");
  return data.racks;
}

export async function getRack(id: string) {
  return apiGet<{ rack: RackDetail }>(`/racks/${id}`);
}

export async function getRackLayout(id: string) {
  return apiGet<{ layout: RackLayout }>(`/racks/${id}/layout`);
}

export async function createRack(payload: {
  name: string;
  rack_width_inches: RackWidthInches;
  rack_units: number;
  rack_cols: number;
}) {
  const result = await apiPost<{ rack: RackDetail; rack_id: string }>("/racks", payload);
  invalidateAfterRackMutation();
  return result;
}

export async function updateRack(
  id: string,
  payload: Partial<{
    name: string;
    rack_width_inches: RackWidthInches;
    rack_units: number;
    rack_cols: number;
  }>
) {
  const result = await apiPatch<{ rack: RackDetail }>(`/racks/${id}`, payload);
  invalidateAfterRackMutation();
  return result;
}

export async function deleteRack(id: string) {
  await apiDelete(`/racks/${id}`);
  invalidateAfterRackMutation();
}
