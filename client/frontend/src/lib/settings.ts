import { apiGet, apiPost, apiPut } from "@/lib/api";

export type AppSettings = {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  GIT_RACKSMITH_BRANCH: string;
  REGISTRY_URL: string;
};

export async function getSettings(): Promise<AppSettings> {
  const data = await apiGet<{ settings: AppSettings }>("/settings");
  return data.settings;
}

export async function updateSettings(
  values: Record<string, string>,
): Promise<AppSettings> {
  const data = await apiPut<{ settings: AppSettings }>("/settings", {
    values,
  });
  return data.settings;
}

export async function clearCache(): Promise<{ deleted_keys: number }> {
  return apiPost<{ deleted_keys: number }>("/settings/clear-cache");
}

export async function getOpenAIModels(): Promise<string[]> {
  const data = await apiGet<{ models: string[] }>("/settings/openai-models");
  return data.models;
}
