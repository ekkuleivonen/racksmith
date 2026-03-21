import { apiGet } from "@/lib/api";

/** Until `GET /defaults` resolves; matches server default. */
export const SSH_PORT_FALLBACK = 22;

export type AppDefaults = {
  ssh_port: number;
  rack_cols_by_width: Record<string, number>;
};

export async function getDefaults(): Promise<AppDefaults> {
  return apiGet<AppDefaults>("/defaults");
}

export function rackColsForWidth(
  defaults: AppDefaults | undefined,
  widthInches: number,
): number {
  const map = defaults?.rack_cols_by_width ?? {};
  const v = map[String(widthInches)] ?? map[widthInches];
  return typeof v === "number" ? v : widthInches === 19 ? 12 : 6;
}
