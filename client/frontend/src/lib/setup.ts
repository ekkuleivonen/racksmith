import { apiDelete, apiGet, apiPost } from "@/lib/api";

export type ActiveRepo = {
  owner: string;
  repo: string;
  full_name: string;
  path: string;
};

export type LocalRepo = ActiveRepo & {
  active: boolean;
};

export type SetupStatus = {
  user: {
    id: string;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };
  repo_ready: boolean;
  hosts_ready: boolean;
  repo: ActiveRepo | null;
  onboarding_completed: boolean;
  has_racksmith_data: boolean;
};

export type GithubRepoChoice = {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
};

export async function getSetupStatus() {
  return apiGet<SetupStatus>("/repos/status");
}

export async function listGithubRepos() {
  const data = await apiGet<{ repos: GithubRepoChoice[] }>("/repos");
  return data.repos;
}

export async function listLocalRepos() {
  const data = await apiGet<{ repos: LocalRepo[] }>("/repos/local-repos");
  return data.repos;
}

export async function selectGithubRepo(owner: string, repo: string) {
  return apiPost<{ repo: ActiveRepo }>("/repos/select", { owner, repo });
}

export async function activateLocalRepo(owner: string, repo: string) {
  return apiPost<{ repo: ActiveRepo }>("/repos/local-repos/activate", { owner, repo });
}

export async function dropLocalRepo(owner: string, repo: string) {
  return apiDelete(`/repos/local-repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
}

export async function createGithubRepo(name: string, isPrivate = true) {
  return apiPost<{ repo: ActiveRepo }>("/repos/create", {
    name,
    private: isPrivate,
  });
}

export async function syncRepo() {
  return apiPost<{ status: string }>("/repos/sync");
}

export async function completeOnboarding() {
  return apiPost<{ status: string }>("/onboarding/complete");
}

export async function factoryReset() {
  return apiPost<{ status: string }>("/onboarding/factory-reset");
}

export type DetectedAnsiblePaths = {
  inventory_path: string | null;
  roles_path: string | null;
  playbooks_path: string | null;
  host_vars_path: string | null;
  group_vars_path: string | null;
};

export type ImportAnsibleSummary = {
  inventory_files: number;
  host_vars_files: number;
  group_vars_files: number;
  roles_imported: number;
  playbooks_imported: number;
};

export async function detectAnsibleResources() {
  const data = await apiPost<{ detected: DetectedAnsiblePaths }>(
    "/repos/detect-ansible"
  );
  return data.detected;
}

export async function importAnsibleResources(paths: {
  inventory_path?: string | null;
  roles_path?: string | null;
  playbooks_path?: string | null;
  host_vars_path?: string | null;
  group_vars_path?: string | null;
}) {
  const data = await apiPost<{ summary: ImportAnsibleSummary }>(
    "/repos/import-ansible",
    paths
  );
  return data.summary;
}
