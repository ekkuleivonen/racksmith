export type ApiVersion = {
  version: string;
  schema_version: number;
  db_version: number;
};

export async function getApiVersion(): Promise<ApiVersion> {
  const res = await fetch("/api/version", { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch version: ${res.status}`);
  }
  return res.json();
}
