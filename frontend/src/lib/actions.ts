import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { StackTargetSelection } from "@/lib/stacks";

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

export type ActionSummary = {
  slug: string;
  name: string;
  description: string;
  source: string;
  inputs: ActionInput[];
  compatibility: { os_family: string[] };
  has_tasks: boolean;
};

export type ActionDetail = ActionSummary & {
  raw_content: string;
  tasks_content: string;
};

export type ActionRun = {
  id: string;
  action_slug: string;
  action_name: string;
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

export type ActionRunRequest = {
  targets: StackTargetSelection;
  vars?: Record<string, unknown>;
  become?: boolean;
  become_password?: string | null;
  runtime_vars?: Record<string, string>;
};

export async function listActions() {
  return apiGet<{ actions: ActionSummary[] }>("/actions");
}

export async function getActionDetail(slug: string) {
  return apiGet<{ action: ActionDetail }>(`/actions/${slug}/detail`);
}

export async function updateAction(slug: string, yamlText: string) {
  return apiPut<{ action: ActionDetail }>(`/actions/${slug}`, { yaml_text: yamlText });
}

export async function createActionFromYaml(yamlText: string) {
  return apiPost<{ action: ActionSummary }>("/actions/from-yaml", { yaml_text: yamlText });
}

export async function deleteAction(slug: string) {
  return apiDelete<void>(`/actions/${slug}`);
}

export async function createActionRun(slug: string, payload: ActionRunRequest) {
  return apiPost<{ run: ActionRun }>(`/actions/${slug}/runs`, payload);
}

export async function listActionRuns(actionSlug?: string) {
  const suffix = actionSlug ? `?action_slug=${encodeURIComponent(actionSlug)}` : "";
  return apiGet<{ runs: ActionRun[] }>(`/actions/runs${suffix}`);
}

export async function getActionRun(runId: string) {
  return apiGet<{ run: ActionRun }>(`/actions/runs/${runId}`);
}

export function actionRunStreamUrl(runId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/actions/runs/${runId}/stream`;
}
