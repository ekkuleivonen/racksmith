import { apiDelete, apiGet, apiPatch, apiPost, wsUrl } from "@/lib/api";
import { invalidateResource } from "@/lib/queryClient";
import type { RoleInput, RoleOutput } from "@/lib/roles";

export type { RoleInput };

export type RoleCatalogEntry = {
  id: string;
  name: string;
  description: string;
  inputs: RoleInput[];
  outputs?: RoleOutput[];
  labels: string[];
};

export type PlaybookRoleEntry = {
  role_id: string;
  vars: Record<string, unknown>;
};

export type PlaybookSummary = {
  id: string;
  path: string;
  name: string;
  description: string;
  roles: string[];
  updated_at: string;
  registry_id: string;
  registry_version: number;
  folder: string;
};

export type PlaybookDetail = PlaybookSummary & {
  roles_catalog: RoleCatalogEntry[];
  role_entries: PlaybookRoleEntry[];
  raw_content: string;
  become: boolean;
};

export type VarFilter = {
  key: string;
  /** Omit or null = key must be present (is set). */
  value?: string | null;
};

export type TargetSelection = {
  groups: string[];
  labels: string[];
  hosts: string[];
  racks: string[];
  var_filters: VarFilter[];
};

export function emptyTargetSelection(): TargetSelection {
  return {
    groups: [],
    labels: [],
    hosts: [],
    racks: [],
    var_filters: [],
  };
}

export type PlaybookUpsert = {
  name: string;
  description: string;
  roles: PlaybookRoleEntry[];
  become?: boolean;
};

export type PlaybookRun = {
  id: string;
  playbook_id: string;
  playbook_name: string;
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  hosts: string[];
  output: string;
  commit_sha: string | null;
};

function invalidateAfterPlaybookMutation() {
  invalidateResource("playbooks", "roles", "filesStatuses", "filesTree");
}

export type PlaybookListResult = {
  playbooks: PlaybookSummary[];
  roles: RoleCatalogEntry[];
};

const LIST_PER_PAGE = 200;

export async function listPlaybooks(q?: string): Promise<PlaybookListResult> {
  const sp = new URLSearchParams();
  sp.set("page", "1");
  sp.set("per_page", String(LIST_PER_PAGE));
  if (q?.trim()) sp.set("q", q.trim());
  const [listData, cat] = await Promise.all([
    apiGet<{
      items: PlaybookSummary[];
      total: number;
      page: number;
      per_page: number;
    }>(`/playbooks?${sp.toString()}`),
    apiGet<{ roles: RoleCatalogEntry[] }>("/playbooks/catalog"),
  ]);
  return { playbooks: listData.items, roles: cat.roles };
}

export type AvailableVarEntry = {
  source: "host_var" | "group_var" | "role_output" | "role_default";
  key: string;
  from: string;
  role_order: number | null;
  description?: string;
  output_type?: string;
};

export async function getPlaybookAvailableVars(playbookId: string) {
  return apiGet<{ vars: AvailableVarEntry[] }>(
    `/playbooks/${playbookId}/available-vars`,
  );
}

export type RequiredRuntimeVarEntry = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
  role_id: string;
  role_name: string;
  secret: boolean;
};

export async function getPlaybookRequiredRuntimeVars(playbookId: string) {
  return apiGet<{
    inputs: RequiredRuntimeVarEntry[];
    needs_become_password: boolean;
  }>(`/playbooks/${playbookId}/required-runtime-vars`);
}

export async function getPlaybook(playbookId: string) {
  return apiGet<{ playbook: PlaybookDetail }>(`/playbooks/${playbookId}`);
}

export async function createPlaybook(payload: PlaybookUpsert) {
  const result = await apiPost<{ playbook: PlaybookDetail }>("/playbooks", payload);
  invalidateAfterPlaybookMutation();
  return result;
}

export async function updatePlaybook(
  playbookId: string,
  payload: PlaybookUpsert
) {
  const result = await apiPatch<{ playbook: PlaybookDetail }>(
    `/playbooks/${playbookId}`,
    payload
  );
  invalidateAfterPlaybookMutation();
  return result;
}

export async function deletePlaybook(playbookId: string, cascadeRoles = false) {
  const qs = cascadeRoles ? "?cascade_roles=true" : "";
  await apiDelete<void>(`/playbooks/${playbookId}${qs}`);
  invalidateAfterPlaybookMutation();
}

export async function movePlaybookToFolder(playbookId: string, folder: string) {
  await apiPatch<void>(`/playbooks/${playbookId}/folder`, { folder });
  invalidateAfterPlaybookMutation();
}

export async function resolveTargets(targets: TargetSelection) {
  return apiPost<{ hosts: string[] }>("/playbooks/resolve-targets", { targets });
}

export type PlaybookRunRequest = {
  targets: TargetSelection;
  runtime_vars?: Record<string, string>;
  become_password?: string | null;
};

export async function createPlaybookRun(playbookId: string, payload: PlaybookRunRequest) {
  return apiPost<{ run: PlaybookRun }>(`/playbooks/${playbookId}/runs`, payload);
}

export function playbookRunStreamUrl(runId: string) {
  return wsUrl(`/playbooks/runs/${runId}/stream`);
}

