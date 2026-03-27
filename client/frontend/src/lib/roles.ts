import { apiDelete, apiGet, apiPatch, apiPost, wsUrl } from "@/lib/api";
import { invalidateResource } from "@/lib/queryClient";
import type { TargetSelection } from "@/lib/playbooks";

function invalidateAfterRoleMutation() {
  invalidateResource("roles", "playbooks", "filesStatuses", "filesTree");
}

export type RoleInput = {
  key: string;
  label: string;
  description?: string;
  placeholder: string;
  default: unknown;
  type?: string;
  options?: string[];
  secret?: boolean;
  runtime?: boolean;
  required?: boolean;
};

export type RoleOutput = {
  key: string;
  description: string;
  type?: string;
};

export type RoleSummary = {
  id: string;
  name: string;
  description: string;
  inputs: RoleInput[];
  outputs?: RoleOutput[];
  labels: string[];
  compatibility: { os_family: string[] };
  has_tasks: boolean;
  registry_id: string;
  registry_version: number;
  folder: string;
};

export type RoleDetail = RoleSummary & {
  raw_content: string;
  tasks_content: string;
};

export type RoleRun = {
  id: string;
  role_id: string;
  role_name: string;
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  hosts: string[];
  output: string;
  vars: Record<string, unknown>;
  become: boolean;
  commit_sha: string | null;
};

export type RoleRunRequest = {
  targets: TargetSelection;
  vars?: Record<string, unknown>;
  become?: boolean;
  become_password?: string | null;
  runtime_vars?: Record<string, string>;
};

const ROLES_PER_PAGE = 200;

export async function listRoles() {
  const data = await apiGet<{
    items: RoleSummary[];
    total: number;
    page: number;
    per_page: number;
  }>(`/roles?page=1&per_page=${ROLES_PER_PAGE}`);
  return data.items;
}

export type LocalRoleFacetItem = { name: string; count: number };

export type RoleFacetsResponse = {
  labels: LocalRoleFacetItem[];
  platforms: LocalRoleFacetItem[];
};

export async function getRoleFacets(): Promise<RoleFacetsResponse> {
  return apiGet<RoleFacetsResponse>("/roles/facets");
}

export async function getRoleDetail(roleId: string) {
  return apiGet<{ role: RoleDetail }>(`/roles/${roleId}`);
}

export async function updateRole(roleId: string, yamlText: string) {
  const result = await apiPatch<{ role: RoleDetail }>(`/roles/${roleId}`, { yaml_text: yamlText });
  invalidateAfterRoleMutation();
  return result;
}

export async function createRoleFromYaml(yamlText: string) {
  const result = await apiPost<{ role: RoleSummary }>("/roles", { yaml_text: yamlText });
  invalidateAfterRoleMutation();
  return result;
}

export async function deleteRole(roleId: string) {
  await apiDelete<void>(`/roles/${roleId}`);
  invalidateAfterRoleMutation();
}

export async function moveRoleToFolder(roleId: string, folder: string) {
  await apiPatch<void>(`/roles/${roleId}/folder`, { folder });
  invalidateAfterRoleMutation();
}

export async function createRoleRun(roleId: string, payload: RoleRunRequest) {
  return apiPost<{ run: RoleRun }>(`/roles/${roleId}/runs`, payload);
}

export function roleRunStreamUrl(runId: string) {
  return wsUrl(`/roles/runs/${runId}/stream`);
}
