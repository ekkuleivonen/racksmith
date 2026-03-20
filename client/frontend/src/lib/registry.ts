import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { invalidateResource } from "@/lib/queryClient";

export type RegistryOwner = {
  username: string;
  avatar_url: string;
};

export type PlatformSpec = {
  name: string;
  versions?: string[];
};

export type RegistryVersion = {
  id: string;
  version_number: number;
  name: string;
  description: string;
  platforms: PlatformSpec[];
  tags: string[];
  inputs: unknown[];
  tasks_yaml: string;
  defaults_yaml: string;
  meta_yaml: string;
  created_at: string;
};

export type RegistryRole = {
  id: string;
  owner: RegistryOwner;
  download_count: number;
  playbook_download_count: number;
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
  q?: string;
  tags?: string;
  platforms?: string;
  owner?: string;
  sort?: "recent" | "downloads" | "name" | "relevance";
  page?: number;
  per_page?: number;
};

export type FacetItem = {
  name: string;
  count: number;
};

export type RegistryFacets = {
  tags: FacetItem[];
  platforms: FacetItem[];
};

export async function listRegistryRoles(
  params: ListRegistryRolesParams = {}
): Promise<RegistryRoleList> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.tags) searchParams.set("tags", params.tags);
  if (params.platforms) searchParams.set("platforms", params.platforms);
  if (params.owner) searchParams.set("owner", params.owner);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.per_page) searchParams.set("per_page", String(params.per_page));

  return apiGet<RegistryRoleList>(`/registry/roles?${searchParams.toString()}`);
}

export async function getRegistryFacets(): Promise<RegistryFacets> {
  return apiGet<RegistryFacets>("/registry/roles/facets");
}

export async function getRegistryRole(id: string): Promise<RegistryRole> {
  return apiGet<RegistryRole>(`/registry/roles/${id}`);
}

export async function pushToRegistry(roleId: string): Promise<RegistryRole> {
  const result = await apiPost<RegistryRole>(`/registry/roles/${roleId}/push`);
  invalidateResource("registry");
  return result;
}

export type RoleImportResponse = {
  id: string;
  name: string;
  message: string;
};

export async function importFromRegistry(
  id: string
): Promise<RoleImportResponse> {
  const result = await apiPost<RoleImportResponse>(`/registry/roles/${id}/import`);
  invalidateResource("roles", "filesTree", "playbooks", "registry");
  return result;
}

export async function deleteRegistryRole(id: string): Promise<void> {
  await apiDelete(`/registry/roles/${id}`);
  invalidateResource("registry");
}

// ---------------------------------------------------------------------------
// Playbook types
// ---------------------------------------------------------------------------

export type PlaybookContributor = {
  username: string;
  avatar_url: string;
};

export type PlaybookRoleRef = {
  registry_role_id: string;
  version_number: number | null;
  vars: Record<string, unknown>;
  role_name: string | null;
};

export type RegistryPlaybookVersion = {
  id: string;
  playbook_id: string;
  version_number: number;
  name: string;
  description: string;
  become: boolean;
  roles: PlaybookRoleRef[];
  tags: string[];
  contributors: PlaybookContributor[];
  created_at: string;
};

export type RegistryPlaybook = {
  id: string;
  owner: RegistryOwner;
  download_count: number;
  created_at: string;
  updated_at: string | null;
  latest_version: RegistryPlaybookVersion | null;
};

export type RegistryPlaybookList = {
  items: RegistryPlaybook[];
  total: number;
  page: number;
  per_page: number;
};

export type ListRegistryPlaybooksParams = {
  q?: string;
  tags?: string;
  owner?: string;
  sort?: "recent" | "downloads" | "name" | "relevance";
  page?: number;
  per_page?: number;
};

export type PlaybookFacets = {
  tags: FacetItem[];
};

export type PlaybookImportResponse = {
  id: string;
  name: string;
  message: string;
};

// ---------------------------------------------------------------------------
// Playbook API functions
// ---------------------------------------------------------------------------

export async function listRegistryPlaybooks(
  params: ListRegistryPlaybooksParams = {},
): Promise<RegistryPlaybookList> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.tags) searchParams.set("tags", params.tags);
  if (params.owner) searchParams.set("owner", params.owner);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.per_page) searchParams.set("per_page", String(params.per_page));

  return apiGet<RegistryPlaybookList>(
    `/registry/playbooks?${searchParams.toString()}`,
  );
}

export async function getRegistryPlaybookFacets(): Promise<PlaybookFacets> {
  return apiGet<PlaybookFacets>("/registry/playbooks/facets");
}

export async function getRegistryPlaybook(
  id: string,
): Promise<RegistryPlaybook> {
  return apiGet<RegistryPlaybook>(`/registry/playbooks/${id}`);
}

export async function pushPlaybookToRegistry(
  playbookId: string,
): Promise<RegistryPlaybook> {
  const result = await apiPost<RegistryPlaybook>(
    `/registry/playbooks/${playbookId}/push`,
  );
  invalidateResource("registry");
  return result;
}

export async function importPlaybookFromRegistry(
  id: string,
): Promise<PlaybookImportResponse> {
  const result = await apiPost<PlaybookImportResponse>(
    `/registry/playbooks/${id}/import`,
  );
  invalidateResource("playbooks", "filesTree", "registry");
  return result;
}

export async function deleteRegistryPlaybook(id: string): Promise<void> {
  await apiDelete(`/registry/playbooks/${id}`);
  invalidateResource("registry");
}
