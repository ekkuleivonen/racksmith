export type VarType = "string" | "number" | "bool";

export type VarRow = {
  key: string;
  value: string | number | boolean;
  type: VarType;
};

function detectType(value: unknown): VarType {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return "number";
  return "string";
}

export function varsToRows(vars: Record<string, unknown>): VarRow[] {
  return Object.entries(vars).map(([key, value]) => ({
    key,
    value: (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      ? value
      : String(value ?? ""),
    type: detectType(value),
  }));
}

export function rowsToVars(rows: VarRow[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    const k = row.key.trim();
    if (k) result[k] = row.value;
  }
  return result;
}
