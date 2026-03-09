import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { queryClient, queryKeys } from "@/lib/queryClient";

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

export type RoleCatalogEntry = {
  slug: string;
  name: string;
  description: string;
  inputs: RoleInput[];
  labels: string[];
};

export type PlaybookRoleEntry = {
  role_slug: string;
  vars: Record<string, unknown>;
};

export type PlaybookSummary = {
  id: string;
  path: string;
  name: string;
  description: string;
  roles: string[];
  updated_at: string;
};

export type PlaybookDetail = PlaybookSummary & {
  roles_catalog: RoleCatalogEntry[];
  role_entries: PlaybookRoleEntry[];
  raw_content: string;
  become: boolean;
};

export type TargetSelection = {
  groups: string[];
  labels: string[];
  hosts: string[];
  racks: string[];
};

export type PlaybookUpsertRequest = {
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
  void queryClient.invalidateQueries({ queryKey: queryKeys.playbooks });
  void queryClient.invalidateQueries({ queryKey: queryKeys.codeStatuses });
  void queryClient.invalidateQueries({ queryKey: queryKeys.codeTree });
}

export async function listPlaybooks(hostSlug?: string) {
  const suffix = hostSlug ? `?host=${encodeURIComponent(hostSlug)}` : "";
  return apiGet<{ playbooks: PlaybookSummary[]; roles: RoleCatalogEntry[] }>(
    `/playbooks${suffix}`
  );
}

export async function getPlaybook(playbookId: string) {
  return apiGet<{ playbook: PlaybookDetail }>(`/playbooks/${playbookId}`);
}

export async function createPlaybook(payload: PlaybookUpsertRequest) {
  const result = await apiPost<{ playbook: PlaybookDetail }>("/playbooks", payload);
  invalidateAfterPlaybookMutation();
  return result;
}

export async function updatePlaybook(
  playbookId: string,
  payload: PlaybookUpsertRequest
) {
  const result = await apiPut<{ playbook: PlaybookDetail }>(
    `/playbooks/${playbookId}`,
    payload
  );
  invalidateAfterPlaybookMutation();
  return result;
}

export async function deletePlaybook(playbookId: string) {
  await apiDelete<void>(`/playbooks/${playbookId}`);
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

export async function listPlaybookRuns(playbookId?: string) {
  const suffix = playbookId ? `?playbook_id=${encodeURIComponent(playbookId)}` : "";
  return apiGet<{ runs: PlaybookRun[] }>(`/playbooks/runs${suffix}`);
}

export async function getPlaybookRun(runId: string) {
  return apiGet<{ run: PlaybookRun }>(`/playbooks/runs/${runId}`);
}

export function playbookRunStreamUrl(runId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/playbooks/runs/${runId}/stream`;
}
