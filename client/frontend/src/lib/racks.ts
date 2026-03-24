import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { invalidateResource } from "@/lib/queryClient";
import type { Host } from "@/lib/hosts";

export type RackWidthInches = 10 | 19;

/** Host row from GET /racks/:id/layout (flat placement). */
export type RackLayoutHost = Omit<Host, "placement"> & {
  placement: "rack";
  position_u_start: number;
  position_u_height: number;
  position_col_start: number;
  position_col_count: number;
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
  hosts: RackLayoutHost[];
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

const RACKS_PER_PAGE = 200;

export async function listRacks() {
  const data = await apiGet<{
    items: RackSummary[];
    total: number;
    page: number;
    per_page: number;
  }>(`/racks?page=1&per_page=${RACKS_PER_PAGE}`);
  return data.items;
}

/** Convert a Host with rack placement to flat RackLayoutHost for RackCanvas. */
export function hostToLayoutHost(host: Host): RackLayoutHost | null {
  const p = host.placement;
  if (!p) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { placement: _placement, ...rest } = host;
  return {
    ...rest,
    id: host.id,
    placement: "rack" as const,
    position_u_start: p.u_start,
    position_u_height: p.u_height ?? 1,
    position_col_start: p.col_start ?? 0,
    position_col_count: p.col_count ?? 1,
  };
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
  const result = await apiPost<{ rack: RackDetail }>("/racks", payload);
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

export async function unassignAllHostsFromRack(rackId: string) {
  await apiDelete(`/racks/${rackId}/hosts`);
  invalidateAfterRackMutation();
}
