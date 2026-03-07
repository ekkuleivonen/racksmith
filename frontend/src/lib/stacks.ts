import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";

export type ActionInput = {
  key: string;
  label: string;
  placeholder: string;
  default: unknown;
  type?: string;
  options?: string[];
  interactive?: boolean;
  required?: boolean;
};

export type Action = {
  slug: string;
  name: string;
  description: string;
  source: string;
  inputs: ActionInput[];
};

export type StackRoleEntry = {
  action_slug: string;
  vars: Record<string, unknown>;
};

export type StackSummary = {
  id: string;
  file_name: string;
  path: string;
  name: string;
  description: string;
  become: boolean;
  roles: string[];
  updated_at: string;
};

export type StackDetail = StackSummary & {
  actions: Action[];
  role_entries: StackRoleEntry[];
  raw_content: string;
};

export type StackTargetSelection = {
  groups: string[];
  tags: string[];
  nodes: string[];
};

export type StackUpsertRequest = {
  file_name?: string;
  name: string;
  description: string;
  become: boolean;
  roles: StackRoleEntry[];
};

export type StackRun = {
  id: string;
  stack_id: string;
  stack_name: string;
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  hosts: string[];
  output: string;
  commit_sha: string | null;
};

export async function listStacks() {
  return apiGet<{ stacks: StackSummary[]; actions: Action[] }>("/stacks");
}

export async function getStack(stackId: string) {
  return apiGet<{ stack: StackDetail }>(`/stacks/${stackId}`);
}

export async function createStack(payload: StackUpsertRequest) {
  return apiPost<{ stack: StackDetail }>("/stacks", payload);
}

export async function updateStack(stackId: string, payload: StackUpsertRequest) {
  return apiPut<{ stack: StackDetail }>(`/stacks/${stackId}`, payload);
}

export async function deleteStack(stackId: string) {
  return apiDelete<void>(`/stacks/${stackId}`);
}

export async function resolveStackTargets(targets: StackTargetSelection) {
  return apiPost<{ hosts: string[] }>("/stacks/resolve-targets", { targets });
}

export type StackRunRequest = {
  targets: StackTargetSelection;
  runtime_vars?: Record<string, string>;
  become_password?: string | null;
};

export async function createStackRun(stackId: string, payload: StackRunRequest) {
  return apiPost<{ run: StackRun }>(`/stacks/${stackId}/runs`, payload);
}

export async function listStackRuns(stackId?: string) {
  const suffix = stackId ? `?stack_id=${encodeURIComponent(stackId)}` : "";
  return apiGet<{ runs: StackRun[] }>(`/stacks/runs${suffix}`);
}

export async function getStackRun(runId: string) {
  return apiGet<{ run: StackRun }>(`/stacks/runs/${runId}`);
}

export function stackRunStreamUrl(runId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/stacks/runs/${runId}/stream`;
}
