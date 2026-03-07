import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";

export type RoleTemplateField = {
  key: string;
  label: string;
  placeholder: string;
  default: unknown;
};

export type RoleTemplate = {
  id: string;
  name: string;
  description: string;
  fields: RoleTemplateField[];
};

export type PlaybookRoleEntry = {
  template_id: string;
  vars: Record<string, unknown>;
};

export type PlaybookSummary = {
  id: string;
  file_name: string;
  path: string;
  play_name: string;
  description: string;
  become: boolean;
  roles: string[];
  updated_at: string;
};

export type PlaybookDetail = PlaybookSummary & {
  role_templates: RoleTemplate[];
  role_entries: PlaybookRoleEntry[];
  raw_content: string;
};

export type PlaybookTargetSelection = {
  groups: string[];
  tags: string[];
  nodes: string[];
};

export type PlaybookUpsertRequest = {
  file_name?: string;
  play_name: string;
  description: string;
  become: boolean;
  roles: PlaybookRoleEntry[];
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

export async function listPlaybooks() {
  return apiGet<{ playbooks: PlaybookSummary[]; role_templates: RoleTemplate[] }>("/playbooks");
}

export async function getPlaybook(playbookId: string) {
  return apiGet<{ playbook: PlaybookDetail }>(`/playbooks/${playbookId}`);
}

export async function createPlaybook(payload: PlaybookUpsertRequest) {
  return apiPost<{ playbook: PlaybookDetail }>("/playbooks", payload);
}

export async function updatePlaybook(playbookId: string, payload: PlaybookUpsertRequest) {
  return apiPut<{ playbook: PlaybookDetail }>(`/playbooks/${playbookId}`, payload);
}

export async function deletePlaybook(playbookId: string) {
  return apiDelete<void>(`/playbooks/${playbookId}`);
}

export async function resolvePlaybookTargets(targets: PlaybookTargetSelection) {
  return apiPost<{ hosts: string[] }>("/playbooks/resolve-targets", { targets });
}

export async function createPlaybookRun(playbookId: string, targets: PlaybookTargetSelection) {
  return apiPost<{ run: PlaybookRun }>(`/playbooks/${playbookId}/runs`, { targets });
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
