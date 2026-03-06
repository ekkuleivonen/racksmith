import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/auth-context";
import { listRacks } from "@/lib/racks";
import {
  createGithubRepo,
  getSetupStatus,
  listGithubRepos,
  selectGithubRepo,
  type GithubRepoChoice,
  type SetupStatus,
} from "@/lib/setup";

const CREATE_NEW_REPO_VALUE = "__create_new_repo__";

export function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoading, isAuthenticated, login } = useAuth();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [repos, setRepos] = useState<GithubRepoChoice[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [selectedRepoValue, setSelectedRepoValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const manageRepos = searchParams.get("manageRepos") === "1";

  const navigateToRackDestination = useCallback(
    async (next: SetupStatus) => {
      if (!next.repo_ready) return;
      if (!next.rack_ready) {
        navigate("/rack/create", { replace: true });
        return;
      }
      const racks = await listRacks();
      navigate(racks[0] ? `/rack/view/${racks[0].id}` : "/rack/create", { replace: true });
    },
    [navigate]
  );

  const refreshStatus = useCallback(async (navigateWhenReady = !manageRepos) => {
    setLoadingStatus(true);
    try {
      const next = await getSetupStatus();
      setStatus(next);
      if (navigateWhenReady && next.repo_ready) {
        await navigateToRackDestination(next);
      }
      return next;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load workspace");
      return null;
    } finally {
      setLoadingStatus(false);
    }
  }, [manageRepos, navigateToRackDestination]);

  const loadRepos = useCallback(async () => {
    setLoadingRepos(true);
    try {
      const next = await listGithubRepos();
      setRepos(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load repositories");
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus(null);
      return;
    }
    void refreshStatus();
  }, [isAuthenticated, refreshStatus]);

  useEffect(() => {
    if (!isAuthenticated || (!manageRepos && status?.repo_ready)) return;
    void loadRepos();
  }, [isAuthenticated, loadRepos, manageRepos, status?.repo_ready]);

  useEffect(() => {
    if (repos.length === 0) {
      setSelectedRepoValue(CREATE_NEW_REPO_VALUE);
      return;
    }
    const activeRepoValue = status?.repo ? `repo:${status.repo.owner}/${status.repo.repo}` : "";
    setSelectedRepoValue((current) => {
      if (current && (current === CREATE_NEW_REPO_VALUE || repos.some((repo) => `repo:${repo.owner}/${repo.name}` === current))) {
        return current;
      }
      if (activeRepoValue) return activeRepoValue;
      const [firstRepo] = repos;
      return firstRepo ? `repo:${firstRepo.owner}/${firstRepo.name}` : CREATE_NEW_REPO_VALUE;
    });
  }, [repos, status?.repo]);

  const selectedExistingRepo = useMemo(() => {
    if (!selectedRepoValue.startsWith("repo:")) return null;
    const fullName = selectedRepoValue.slice("repo:".length);
    return repos.find((repo) => `${repo.owner}/${repo.name}` === fullName) ?? null;
  }, [repos, selectedRepoValue]);

  if (isLoading || (isAuthenticated && loadingStatus && !status)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 overflow-auto">
        <div className="max-w-xl w-full mx-4 space-y-8">
          <div className="space-y-3 text-center">
            <h1 className="text-3xl font-bold text-zinc-100">RACKSMITH</h1>
            <p className="text-sm text-zinc-500">
              Rack builder, SSH terminal, and code workspace backed by your locally cloned GitHub repo.
            </p>
          </div>

          <Card className="border-zinc-800 bg-zinc-900/40">
            <CardHeader>
              <CardTitle>Get started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-zinc-400 text-sm">
                Sign in with GitHub, choose or create a repo, then create your first rack.
              </p>
              <Button onClick={login}>Login with GitHub</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!status?.repo_ready || manageRepos) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="space-y-1">
            <h1 className="text-zinc-100 text-xl font-semibold">
              {manageRepos ? "Manage repos" : "Choose a repo for your racks"}
            </h1>
            <p className="text-sm text-zinc-500">
              Signed in as {user?.login}. Repositories are cloned locally and can contain multiple racks.
            </p>
          </div>

          <Card className="border-zinc-800 bg-zinc-900/40">
            <CardHeader className="space-y-3">
              <CardTitle>Repo</CardTitle>
              <p className="text-xs text-zinc-500">
                Import an existing repo with `.racksmith`, or use the final option to create a new one.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingRepos ? (
                <p className="text-zinc-500 text-sm">Loading repositories...</p>
              ) : (
                <>
                  <Select
                    disabled={submitting}
                    value={selectedRepoValue}
                    onValueChange={setSelectedRepoValue}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a repo" />
                    </SelectTrigger>
                    <SelectContent>
                      {repos.map((repo) => (
                        <SelectItem key={repo.id} value={`repo:${repo.owner}/${repo.name}`}>
                          {repo.full_name}
                        </SelectItem>
                      ))}
                      <SelectItem value={CREATE_NEW_REPO_VALUE}>Create new repo</SelectItem>
                    </SelectContent>
                  </Select>

                  {selectedRepoValue === CREATE_NEW_REPO_VALUE ? (
                    <>
                      <p className="text-sm text-zinc-500">
                        {repos.length === 0
                          ? "No importable repositories found. Create a new one to continue."
                          : "Create a fresh GitHub repo and make it the active local repo."}
                      </p>
                      <Input
                        value={newRepoName}
                        onChange={(event) => setNewRepoName(event.target.value)}
                        placeholder="rack-office"
                      />
                      <Button
                        disabled={submitting || !newRepoName.trim()}
                        onClick={async () => {
                          setSubmitting(true);
                          try {
                            await createGithubRepo(newRepoName.trim(), true);
                            await refreshStatus(true);
                            toast.success(`Created ${newRepoName.trim()}`);
                          } catch (error) {
                            toast.error(
                              error instanceof Error ? error.message : "Failed to create repo"
                            );
                          } finally {
                            setSubmitting(false);
                          }
                        }}
                      >
                        Create and use repo
                      </Button>
                    </>
                  ) : selectedExistingRepo ? (
                    <>
                      <p className="text-sm text-zinc-500">
                        {selectedExistingRepo.private
                          ? "Private repo"
                          : "Public repo"}{" "}
                        ready to import.
                      </p>
                      <Button
                        disabled={submitting}
                        onClick={async () => {
                          setSubmitting(true);
                          try {
                            await selectGithubRepo(
                              selectedExistingRepo.owner,
                              selectedExistingRepo.name
                            );
                            await refreshStatus(true);
                            toast.success(`Using ${selectedExistingRepo.full_name}`);
                          } catch (error) {
                            toast.error(
                              error instanceof Error ? error.message : "Failed to select repo"
                            );
                          } finally {
                            setSubmitting(false);
                          }
                        }}
                      >
                        Use repo
                      </Button>
                    </>
                  ) : (
                    <p className="text-zinc-500 text-sm">Select a repo to continue.</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          {manageRepos ? (
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => void refreshStatus(true)}>
                Back to app
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return null;
}
