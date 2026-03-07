import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Loader2, Trash2 } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { RepoCombobox } from "@/components/repo-combobox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/auth-context";
import {
  createGithubRepo,
  listGithubRepos,
  selectGithubRepo,
  type GithubRepoChoice,
} from "@/lib/setup";
import { fetchMachinePublicKey } from "@/lib/ssh";
import { useSetupStore } from "@/stores/setup";
import { useNodesStore } from "@/stores/nodes";
import { useRackStore } from "@/stores/racks";
import { RackOnboardingPage } from "@/pages/RackOnboardingPage";
import { SetupNodesStep } from "@/components/setup/setup-nodes-step";

const WANTS_RACK_KEY = "racksmith_wants_rack";

function getWantsRackFromStorage(): boolean | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(WANTS_RACK_KEY);
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function persistWantsRack(value: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WANTS_RACK_KEY, String(value));
}

type RequiredStep = 1 | 2 | 3 | "done";

function computeStep(
  isAuthenticated: boolean,
  repoReady: boolean,
  nodesCount: number
): RequiredStep {
  if (!isAuthenticated) return 1;
  if (!repoReady) return 2;
  if (nodesCount === 0) return 3;
  return "done";
}

function computeProgress(
  step: RequiredStep,
  wantsRack: boolean | null,
  rackCount: number
): number {
  if (step === 1) return 20;
  if (step === 2) return 40;
  if (step === 3) return 60;
  if (wantsRack === null) return 80;
  if (wantsRack === true && rackCount === 0) return 90;
  return 100;
}

export function SetupPage() {
  const navigate = useNavigate();
  const { isLoading: authLoading, isAuthenticated, login } = useAuth();
  const status = useSetupStore((s) => s.status);
  const loadSetup = useSetupStore((s) => s.load);
  const nodes = useNodesStore((s) => s.nodes);
  const loadNodes = useNodesStore((s) => s.load);
  const rackEntries = useRackStore((s) => s.rackEntries);
  const loadRacks = useRackStore((s) => s.load);

  const [wantsRack, setWantsRackState] = useState<boolean | null>(getWantsRackFromStorage);
  const setWantsRack = useCallback((value: boolean) => {
    persistWantsRack(value);
    setWantsRackState(value);
  }, []);

  const [repos, setRepos] = useState<GithubRepoChoice[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [activeTab, setActiveTab] = useState<"existing" | "create">("existing");
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(null);
  const [newRepoName, setNewRepoName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ owner: string; repo: string } | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [setupPublicKey, setSetupPublicKey] = useState<string | null>(null);
  const [setupPublicKeyLoading, setSetupPublicKeyLoading] = useState(false);
  const localRepos = useSetupStore((s) => s.localRepos);
  const dropRepo = useSetupStore((s) => s.dropRepo);

  const step = computeStep(
    isAuthenticated,
    status?.repo_ready ?? false,
    nodes.length
  );

  const refreshStatus = useCallback(async () => {
    try {
      await useSetupStore.getState().load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load workspace");
    }
  }, []);

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

  const navigateHome = useCallback(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  useEffect(() => {
    void loadSetup();
    void loadNodes();
    void loadRacks();
  }, [loadSetup, loadNodes, loadRacks]);

  useEffect(() => {
    if (step !== 3) return;
    setSetupPublicKeyLoading(true);
    fetchMachinePublicKey()
      .then((res) => setSetupPublicKey(res.public_key))
      .catch(() => setSetupPublicKey(null))
      .finally(() => setSetupPublicKeyLoading(false));
  }, [step]);

  useEffect(() => {
    if (isAuthenticated) {
      void loadRepos();
    }
  }, [isAuthenticated, loadRepos]);

  useEffect(() => {
    if (repos.length === 0 || !status) return;
    const activeFullName = status.repo ? `${status.repo.owner}/${status.repo.repo}` : null;
    setSelectedRepoFullName((current) => {
      if (current && repos.some((r) => `${r.owner}/${r.name}` === current)) return current;
      return activeFullName ?? null;
    });
  }, [repos, status?.repo]);

  useEffect(() => {
    if (step !== "done") return;
    if (wantsRack === null) return;
    if (wantsRack === true && rackEntries.length === 0) return;
    navigateHome();
  }, [step, wantsRack, rackEntries.length, navigateHome]);

  const selectedExistingRepo = useMemo(() => {
    if (!selectedRepoFullName) return null;
    return repos.find((r) => `${r.owner}/${r.name}` === selectedRepoFullName) ?? null;
  }, [repos, selectedRepoFullName]);

  const repoItems = useMemo(() => repos.map((r) => r.full_name), [repos]);

  const progress = computeProgress(step, wantsRack, rackEntries.length);

  const handleLogin = useCallback(() => {
    setSigningIn(true);
    login();
  }, [login]);

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="flex-1 flex flex-col p-6">
        <div className="max-w-md w-full mx-auto flex-1 flex flex-col justify-center">
          <div className="space-y-4 mb-6">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-zinc-500">Step 1 of 5</p>
          </div>
          <Card className="border-zinc-800 bg-zinc-900/40">
            <CardHeader>
              <CardTitle>Step 1 — Sign in</CardTitle>
              <p className="text-sm text-zinc-500">
                Sign in with GitHub to connect your repos.
              </p>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleLogin}
                className="w-full"
                disabled={signingIn}
              >
                {signingIn ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Redirecting to GitHub…
                  </>
                ) : (
                  "Sign in with GitHub"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (step === 2) {
    const hasRepo = status?.repo_ready ?? false;
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="space-y-2">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-zinc-500">Step 2 of 5</p>
          </div>
          <div className="space-y-1">
            <h1 className="text-zinc-100 text-xl font-semibold">Step 2 — Select repo</h1>
            <p className="text-sm text-zinc-500">
              Pick a Git repo to use with Racksmith. Everything lives in version control.
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
                          {selectedExistingRepo.private ? "Private" : "Public"} repo ready to import.
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
                              await refreshStatus();
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
                          {submitting ? (
                            <>
                              <Loader2 className="mr-2 size-4 animate-spin" />
                              Using repo…
                            </>
                          ) : (
                            "Use repo and continue"
                          )}
                        </Button>
                      </>
                    ) : (
                      <p className="text-zinc-500 text-sm">
                        {repos.length === 0
                          ? "No repositories found."
                          : "Search and select a repo."}
                      </p>
                    )}
                  </TabsContent>
                  <TabsContent value="create" className="mt-4 space-y-4">
                    <p className="text-sm text-zinc-500">
                      Create a fresh GitHub repo and use it with Racksmith.
                    </p>
                    <Input
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value)}
                      placeholder="rack-office"
                    />
                    <Button
                      disabled={submitting || !newRepoName.trim()}
                      onClick={async () => {
                        setSubmitting(true);
                        try {
                          await createGithubRepo(newRepoName.trim(), true);
                          await refreshStatus();
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
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Creating…
                        </>
                      ) : (
                        "Create and continue"
                      )}
                    </Button>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>

          {localRepos.length > 0 && (
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
          )}

          {hasRepo && (
            <div className="flex justify-end">
              <Button onClick={() => void refreshStatus()}>Continue</Button>
            </div>
          )}
        </div>

        <AlertDialog open={!!dropTarget} onOpenChange={(open) => !open && setDropTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Drop repo from server</AlertDialogTitle>
              <AlertDialogDescription>
                Remove {dropTarget?.owner}/{dropTarget?.repo}? The clone will be deleted from disk.
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
                  await refreshStatus();
                }}
              >
                Drop
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="space-y-2">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-zinc-500">Step 3 of 5</p>
          </div>
          <div className="space-y-1">
            <h1 className="text-zinc-100 text-xl font-semibold">Step 3 — Add hardware</h1>
            <p className="text-sm text-zinc-500">
              Add at least one node. Each node is a machine you can SSH into and run stacks on.
            </p>
          </div>

          <Card className="border-zinc-800 bg-zinc-900/40">
            <CardHeader className="space-y-2">
              <CardTitle className="text-base">Racksmith public key</CardTitle>
              <p className="text-xs text-zinc-500">
                Add this key to each host&apos;s <code className="rounded bg-zinc-800 px-1">~/.ssh/authorized_keys</code> so
                Racksmith can SSH in without a password.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <textarea
                  readOnly
                  value={setupPublicKeyLoading ? "Loading..." : setupPublicKey ?? ""}
                  className="min-h-20 flex-1 rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-[11px] text-zinc-200 outline-none resize-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!setupPublicKey || setupPublicKeyLoading}
                  onClick={async () => {
                    if (!setupPublicKey) return;
                    try {
                      await navigator.clipboard.writeText(setupPublicKey);
                      toast.success("Copied to clipboard");
                    } catch {
                      toast.error("Failed to copy");
                    }
                  }}
                >
                  <Copy className="size-3" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <SetupNodesStep onContinue={() => {}} canContinue={nodes.length > 0} />
        </div>
      </div>
    );
  }

  if (step === "done") {
    if (wantsRack === null) {
      return (
        <div className="flex-1 flex flex-col p-6">
          <div className="max-w-md w-full mx-auto flex-1 flex flex-col justify-center">
            <div className="space-y-2 mb-6">
              <Progress value={progress} className="h-1.5" />
              <p className="text-xs text-zinc-500">Step 4 of 5</p>
            </div>
            <Card className="border-zinc-800 bg-zinc-900/40">
              <CardHeader>
                <CardTitle>Place on rack?</CardTitle>
              <p className="text-sm text-zinc-500">
                You have {nodes.length} node{nodes.length !== 1 ? "s" : ""}. Would you like to
                visualize them on a rack? You can skip and do this later.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full"
                onClick={() => setWantsRack(true)}
              >
                Yes, create a rack
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setWantsRack(false);
                  navigateHome();
                }}
              >
                Skip for now
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      );
    }

    if (wantsRack === false) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-500 text-sm">Redirecting...</p>
        </div>
      );
    }

    if (rackEntries.length > 0) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-500 text-sm">Redirecting...</p>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="space-y-2">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-zinc-500">Step 5 of 5</p>
          </div>
          <div className="space-y-1">
            <h1 className="text-zinc-100 text-xl font-semibold">Create rack</h1>
            <p className="text-sm text-zinc-500">
              Define a rack and place your nodes. You can add more racks later.
            </p>
          </div>
          <RackOnboardingPage
            onCreated={(rackSlug) => {
              navigate(`/rack/view/${rackSlug}`, { replace: true });
            }}
          />
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setWantsRack(false);
                navigateHome();
              }}
            >
              Skip rack setup
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
