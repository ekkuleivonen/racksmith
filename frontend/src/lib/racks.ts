import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Node } from "@/lib/nodes";

export type RackWidthInches = 10 | 19;

/** Canvas-compatible node shape (flat placement fields). Layout only has nodes on the rack. */
export type RackLayoutNode = Omit<Node, "placement"> & {
  placement: "rack";
  position_u_start: number;
  position_u_height: number;
  position_col_start: number;
  position_col_count: number;
};

export function nodeToRackLayoutNode(node: Node): RackLayoutNode {
  const p = node.placement!;
  return {
    ...node,
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
  slug: string;
  name: string;
  rack_width_inches: RackWidthInches;
  rack_units: number;
  rack_cols: number;
  created_at: string;
};

export type RackDetail = {
  slug: string;
  name: string;
  rack_width_inches: RackWidthInches;
  rack_units: number;
  rack_cols: number;
  created_at: string;
  updated_at: string;
};

export type RackLayout = RackDetail & {
  nodes: Node[];
};

export type ZoneSelection = {
  startU: number;
  heightU: number;
  startCol: number;
  colCount: number;
};

export async function listRacks() {
  const data = await apiGet<{ racks: RackSummary[] }>("/racks");
  return data.racks;
}

export async function getRack(slug: string) {
  return apiGet<{ rack: RackDetail }>(`/racks/${slug}`);
}

export async function getRackLayout(slug: string) {
  return apiGet<{ layout: RackLayout }>(`/racks/${slug}/layout`);
}

export async function createRack(payload: {
  name: string;
  rack_width_inches: RackWidthInches;
  rack_units: number;
  rack_cols: number;
}) {
  return apiPost<{ rack: RackDetail; rack_slug: string }>("/racks", payload);
}

export async function updateRack(
  slug: string,
  payload: Partial<{
    name: string;
    rack_width_inches: RackWidthInches;
    rack_units: number;
    rack_cols: number;
  }>
) {
  return apiPatch<{ rack: RackDetail }>(`/racks/${slug}`, payload);
}

export async function deleteRack(slug: string) {
  return apiDelete(`/racks/${slug}`);
}
