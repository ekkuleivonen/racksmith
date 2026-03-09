import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { TargetSelection } from "@/lib/playbooks";

export type RoleInput = {
  key: string;
  label: string;
  placeholder: string;
  default: unknown;
  type?: string;
  options?: string[];
  interactive?: boolean;
  required?: boolean;
};

export type RoleSummary = {
  slug: string;
  name: string;
  description: string;
  inputs: RoleInput[];
  labels: string[];
  compatibility: { os_family: string[] };
  has_tasks: boolean;
};

export type RoleDetail = RoleSummary & {
  raw_content: string;
  tasks_content: string;
};

export type RoleRun = {
  id: string;
  role_slug: string;
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
  return apiGet<{ roles: RoleSummary[] }>("/roles");
}

export async function getRoleDetail(slug: string) {
  return apiGet<{ role: RoleDetail }>(`/roles/${slug}/detail`);
}

export async function updateRole(slug: string, yamlText: string) {
  return apiPut<{ role: RoleDetail }>(`/roles/${slug}`, { yaml_text: yamlText });
}

export async function createRoleFromYaml(yamlText: string) {
  return apiPost<{ role: RoleSummary }>("/roles/from-yaml", { yaml_text: yamlText });
}

export async function deleteRole(slug: string) {
  return apiDelete<void>(`/roles/${slug}`);
}

export async function createRoleRun(slug: string, payload: RoleRunRequest) {
  return apiPost<{ run: RoleRun }>(`/roles/${slug}/runs`, payload);
}

export async function listRoleRuns(roleSlug?: string) {
  const suffix = roleSlug ? `?role_slug=${encodeURIComponent(roleSlug)}` : "";
  return apiGet<{ runs: RoleRun[] }>(`/roles/runs${suffix}`);
}

export async function getRoleRun(runId: string) {
  return apiGet<{ run: RoleRun }>(`/roles/runs/${runId}`);
}

export function roleRunStreamUrl(runId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/roles/runs/${runId}/stream`;
}
