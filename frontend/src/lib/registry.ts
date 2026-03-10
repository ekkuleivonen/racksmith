import { apiGet, apiPost, apiDelete } from "./api";

const RACKSMITH_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";

export type RegistryOwner = {
  username: string;
  avatar_url: string;
};

export type RegistryVersion = {
  id: string;
  version_number: number;
  racksmith_version: string;
  name: string;
  description: string;
  platforms: unknown[];
  tags: string[];
  inputs: unknown[];
  tasks_yaml: string;
  defaults_yaml: string;
  meta_yaml: string;
  created_at: string;
};

export type RegistryRole = {
  id: string;
  slug: string;
  owner: RegistryOwner;
  download_count: number;
  created_at: string;
  updated_at: string | null;
  latest_version: RegistryVersion | null;
};

export type RegistryRoleList = {
  items: RegistryRole[];
  total: number;
  page: number;
  per_page: number;
};

export type ListRegistryRolesParams = {
  racksmith_version?: string;
  q?: string;
  tags?: string;
  owner?: string;
  sort?: "recent" | "downloads" | "name";
  page?: number;
  per_page?: number;
};

export async function listRegistryRoles(
  params: ListRegistryRolesParams = {}
): Promise<RegistryRoleList> {
  const searchParams = new URLSearchParams();
  searchParams.set("racksmith_version", params.racksmith_version ?? RACKSMITH_VERSION);
  if (params.q) searchParams.set("q", params.q);
  if (params.tags) searchParams.set("tags", params.tags);
  if (params.owner) searchParams.set("owner", params.owner);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.per_page) searchParams.set("per_page", String(params.per_page));

  return apiGet<RegistryRoleList>(`/registry/roles?${searchParams.toString()}`);
}

export async function getRegistryRole(slug: string): Promise<RegistryRole> {
  return apiGet<RegistryRole>(`/registry/roles/${slug}`);
}

export async function getRegistryRoleVersions(
  slug: string
): Promise<RegistryVersion[]> {
  return apiGet<RegistryVersion[]>(`/registry/roles/${slug}/versions`);
}

export async function pushToRegistry(slug: string): Promise<RegistryRole> {
  return apiPost<RegistryRole>(`/registry/roles/${slug}/push`);
}

export type RoleImportResponse = {
  slug: string;
  name: string;
  message: string;
};

export async function importFromRegistry(
  slug: string
): Promise<RoleImportResponse> {
  return apiPost<RoleImportResponse>(`/registry/roles/${slug}/import`);
}

export async function deleteRegistryRole(slug: string): Promise<void> {
  return apiDelete(`/registry/roles/${slug}`);
}
