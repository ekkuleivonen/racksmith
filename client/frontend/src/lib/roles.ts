import { apiDelete, apiGet, apiPost, apiPut, wsUrl } from "@/lib/api";
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

export async function listRoles() {
  const data = await apiGet<{ roles: RoleSummary[] }>("/roles");
  return data.roles;
}

export async function getRoleDetail(roleId: string) {
  return apiGet<{ role: RoleDetail }>(`/roles/${roleId}/detail`);
}

export async function updateRole(roleId: string, yamlText: string) {
  const result = await apiPut<{ role: RoleDetail }>(`/roles/${roleId}`, { yaml_text: yamlText });
  invalidateAfterRoleMutation();
  return result;
}

export async function createRoleFromYaml(yamlText: string) {
  const result = await apiPost<{ role: RoleSummary }>("/roles/from-yaml", { yaml_text: yamlText });
  invalidateAfterRoleMutation();
  return result;
}

export async function deleteRole(roleId: string) {
  await apiDelete<void>(`/roles/${roleId}`);
  invalidateAfterRoleMutation();
}

export async function createRoleRun(roleId: string, payload: RoleRunRequest) {
  return apiPost<{ run: RoleRun }>(`/roles/${roleId}/runs`, payload);
}

export function roleRunStreamUrl(runId: string) {
  return wsUrl(`/roles/runs/${runId}/stream`);
}
