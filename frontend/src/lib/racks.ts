export type RackWidthInches = 10 | 19;

export const COLS_BY_WIDTH: Record<RackWidthInches, number> = {
  19: 12,
  10: 6,
};

export type RackSummary = {
  id: string;
  owner_login: string;
  name: string | null;
  rack_width_inches: RackWidthInches;
  rack_units: number;
  created_at: string;
  item_count: number;
};

export type RackItem = {
  id: string;
  position_u_start: number;
  position_u_height: number;
  position_col_start: number;
  position_col_count: number;
  has_no_ip: boolean;
  ip_address: string | null;
  name: string | null;
};

export type RackDetail = {
  id: string;
  owner_login: string;
  name: string | null;
  rack_width_inches: RackWidthInches;
  rack_units: number;
  rack_cols: number;
  created_at: string;
};

export type ZoneSelection = {
  startU: number;
  heightU: number;
  startCol: number;
  colCount: number;
};
