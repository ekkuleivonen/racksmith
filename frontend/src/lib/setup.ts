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
  nodes_ready: boolean;
  repo: ActiveRepo | null;
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
  const data = await apiGet<{ repos: GithubRepoChoice[] }>("/repos/repos");
  return data.repos;
}

export async function listLocalRepos() {
  const data = await apiGet<{ repos: LocalRepo[] }>("/repos/local-repos");
  return data.repos;
}

export async function selectGithubRepo(owner: string, repo: string) {
  return apiPost<{ repo: ActiveRepo }>("/repos/repos/select", { owner, repo });
}

export async function activateLocalRepo(owner: string, repo: string) {
  return apiPost<{ repo: ActiveRepo }>("/repos/local-repos/activate", { owner, repo });
}

export async function dropLocalRepo(owner: string, repo: string) {
  return apiDelete(`/repos/local-repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
}

export async function createGithubRepo(name: string, isPrivate = true) {
  return apiPost<{ repo: ActiveRepo }>("/repos/repos/create", {
    name,
    private: isPrivate,
  });
}

export async function syncRepo() {
  return apiPost<{ status: string }>("/repos/sync");
}
