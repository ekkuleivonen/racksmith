import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer } from "@/components/shared/page-container";
import { RepoCombobox } from "@/components/repo-combobox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toastApiError } from "@/lib/api";
import { useAuth } from "@/context/auth-context";
import { listHosts } from "@/lib/hosts";
import {
  createGithubRepo,
  getSetupStatus,
  listGithubRepos,
  selectGithubRepo,
  type GithubRepoChoice,
  type SetupStatus,
} from "@/lib/setup";
import { useSetupStore } from "@/stores/setup";

export function ReposPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [repos, setRepos] = useState<GithubRepoChoice[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [activeTab, setActiveTab] = useState<"existing" | "create">("existing");
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(null);
  const [newRepoName, setNewRepoName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ owner: string; repo: string } | null>(null);
  const localRepos = useSetupStore((s) => s.localRepos);
  const dropRepo = useSetupStore((s) => s.dropRepo);
  const loadSetup = useSetupStore((s) => s.load);

  const navigateToAppDestination = useCallback(
    async (next: SetupStatus) => {
      if (!next.repo_ready) return;
      if (!next.hosts_ready) {
        navigate("/", { replace: true });
        return;
      }
      const hosts = await listHosts();
      navigate(hosts[0] ? `/?host=${hosts[0].id}` : "/", { replace: true });
    },
    [navigate]
  );

  const refreshStatus = useCallback(
    async (navigateWhenReady = false) => {
      try {
        const next = await getSetupStatus();
        setStatus(next);
        if (navigateWhenReady && next.repo_ready) {
          await navigateToAppDestination(next);
        }
        return next;
      } catch (error) {
        toastApiError(error, "Failed to load workspace");
        return null;
      }
    },
    [navigateToAppDestination]
  );

  const loadRepos = useCallback(async () => {
    setLoadingRepos(true);
    try {
      const next = await listGithubRepos();
      setRepos(next);
    } catch (error) {
      toastApiError(error, "Failed to load repositories");
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void loadSetup();
  }, [refreshStatus, loadSetup]);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  useEffect(() => {
    if (repos.length === 0) return;
    const activeFullName = status?.repo ? `${status.repo.owner}/${status.repo.repo}` : null;
    setSelectedRepoFullName((current) => {
      if (current && repos.some((r) => `${r.owner}/${r.name}` === current)) return current;
      return activeFullName ?? null;
    });
  }, [repos, status?.repo]);

  const selectedExistingRepo = useMemo(() => {
    if (!selectedRepoFullName) return null;
    return repos.find((r) => `${r.owner}/${r.name}` === selectedRepoFullName) ?? null;
  }, [repos, selectedRepoFullName]);

  const repoItems = useMemo(() => repos.map((r) => r.full_name), [repos]);

  return (
    <>
    <PageContainer>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-zinc-100 text-xl font-semibold">Manage repos</h1>
          <p className="text-sm text-zinc-500">
            Signed in as {user?.login}. Racksmith works as a plugin for any Git repo.
          </p>
        </div>

        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardHeader className="space-y-3">
            <CardTitle>Repo</CardTitle>
            <p className="text-xs text-zinc-500">
              Import an existing repo or create a new one.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingRepos ? (
              <p className="text-zinc-500 text-sm">Loading repositories...</p>
            ) : (
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "existing" | "create")}
              >
                <TabsList variant="line" className="w-full">
                  <TabsTrigger value="existing" className="flex-1">
                    Select from existing
                  </TabsTrigger>
                  <TabsTrigger value="create" className="flex-1">
                    Create new repo
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="existing" className="mt-4 space-y-4">
                  <RepoCombobox
                    items={repoItems}
                    value={selectedRepoFullName}
                    onValueChange={setSelectedRepoFullName}
                    disabled={submitting}
                    placeholder="Search repos..."
                  />
                  {selectedExistingRepo ? (
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
                            toastApiError(error, "Failed to select repo");
                          } finally {
                            setSubmitting(false);
                          }
                        }}
                      >
                        Use repo
                      </Button>
                    </>
                  ) : (
                    <p className="text-zinc-500 text-sm">
                      {repos.length === 0
                        ? "No repositories found."
                        : "Search and select a repo to import."}
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="create" className="mt-4 space-y-4">
                  <p className="text-sm text-zinc-500">
                    Create a fresh GitHub repo and make it the active local repo.
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
                        toastApiError(error, "Failed to create repo");
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    Create and use repo
                  </Button>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {localRepos.length > 0 ? (
          <Card className="border-zinc-800 bg-zinc-900/40">
            <CardHeader className="space-y-3">
              <CardTitle>Local repos</CardTitle>
              <p className="text-xs text-zinc-500">
                Repos cloned on this server. Dropping removes the clone from disk.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {localRepos.map((repo) => (
                  <li
                    key={repo.full_name}
                    className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                  >
                    <span className="text-sm text-zinc-200 truncate">
                      {repo.full_name}
                      {repo.active ? (
                        <span className="ml-2 text-xs text-zinc-500">(active)</span>
                      ) : null}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-red-400 hover:text-red-300 hover:bg-red-950/40"
                      onClick={() => setDropTarget({ owner: repo.owner, repo: repo.repo })}
                      aria-label={`Drop ${repo.full_name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {status?.repo_ready ? (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => void refreshStatus(true)}>
              Back to app
            </Button>
          </div>
        ) : null}
      </div>
    </PageContainer>

    <AlertDialog
      open={!!dropTarget}
      onOpenChange={(open) => !open && setDropTarget(null)}
    >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Drop repo from server</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {dropTarget?.owner}/{dropTarget?.repo} from this Racksmith server? The
              clone will be deleted from disk. You can re-import it later from GitHub.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!dropTarget) return;
                await dropRepo(dropTarget.owner, dropTarget.repo);
                setDropTarget(null);
                await refreshStatus(true);
              }}
            >
              Drop
            </AlertDialogAction>
          </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
