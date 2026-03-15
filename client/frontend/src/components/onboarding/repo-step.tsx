import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepoCombobox } from "@/components/repo-combobox";
import {
  createGithubRepo,
  listGithubRepos,
  selectGithubRepo,
  type GithubRepoChoice,
} from "@/lib/setup";
import { useSetupStore } from "@/stores/setup";

type RepoStepProps = {
  onRepoReady?: () => void;
  showLocalClones?: boolean;
  showActivate?: boolean;
};

export function RepoStep({
  onRepoReady,
  showLocalClones = true,
  showActivate = false,
}: RepoStepProps) {
  const status = useSetupStore((s) => s.status);
  const localRepos = useSetupStore((s) => s.localRepos);
  const switchingRepo = useSetupStore((s) => s.switchingRepo);
  const switchRepo = useSetupStore((s) => s.switchRepo);
  const dropRepo = useSetupStore((s) => s.dropRepo);
  const loadSetup = useSetupStore((s) => s.load);

  const [dropTarget, setDropTarget] = useState<{
    owner: string;
    repo: string;
  } | null>(null);

  const [ghRepos, setGhRepos] = useState<GithubRepoChoice[]>([]);
  const [loadingGhRepos, setLoadingGhRepos] = useState(false);
  const [importTab, setImportTab] = useState<"existing" | "create">(
    "existing",
  );
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<
    string | null
  >(null);
  const [newRepoName, setNewRepoName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadGhRepos = useCallback(async () => {
    setLoadingGhRepos(true);
    try {
      setGhRepos(await listGithubRepos());
    } catch (error) {
      toastApiError(error, "Failed to load repositories");
    } finally {
      setLoadingGhRepos(false);
    }
  }, []);

  useEffect(() => {
    void loadGhRepos();
  }, [loadGhRepos]);

  useEffect(() => {
    if (ghRepos.length === 0) return;
    const activeFullName = status?.repo
      ? `${status.repo.owner}/${status.repo.repo}`
      : null;
    setSelectedRepoFullName((cur) => {
      if (cur && ghRepos.some((r) => `${r.owner}/${r.name}` === cur))
        return cur;
      return activeFullName ?? null;
    });
  }, [ghRepos, status?.repo]);

  const selectedExistingRepo = useMemo(() => {
    if (!selectedRepoFullName) return null;
    return (
      ghRepos.find(
        (r) => `${r.owner}/${r.name}` === selectedRepoFullName,
      ) ?? null
    );
  }, [ghRepos, selectedRepoFullName]);

  const ghRepoItems = useMemo(
    () => ghRepos.map((r) => r.full_name),
    [ghRepos],
  );

  const handleImportRepo = async () => {
    if (!selectedExistingRepo || submitting) return;
    setSubmitting(true);
    try {
      await selectGithubRepo(
        selectedExistingRepo.owner,
        selectedExistingRepo.name,
      );
      await loadSetup();
      toast.success(`Using ${selectedExistingRepo.full_name}`);
      onRepoReady?.();
    } catch (error) {
      toastApiError(error, "Failed to select repo");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRepo = async () => {
    if (!newRepoName.trim() || submitting) return;
    setSubmitting(true);
    try {
      await createGithubRepo(newRepoName.trim(), true);
      await loadSetup();
      toast.success(`Created ${newRepoName.trim()}`);
      setNewRepoName("");
      onRepoReady?.();
    } catch (error) {
      toastApiError(error, "Failed to create repo");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardHeader className="space-y-1">
          <CardTitle>Repository</CardTitle>
          <p className="text-xs text-zinc-500">
            Pick an existing GitHub repo or create a new one. Everything lives
            in version control.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {showLocalClones && localRepos.length > 0 && (
            <>
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Local clones</Label>
                <ul className="space-y-1.5">
                  {localRepos.map((repo) => (
                    <li
                      key={repo.full_name}
                      className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-1.5"
                    >
                      <span className="text-sm text-zinc-200 truncate">
                        {repo.full_name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {repo.active ? (
                          <span className="text-[11px] text-zinc-500 flex items-center gap-1 mr-1">
                            <Check className="size-3" />
                            active
                          </span>
                        ) : showActivate ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-zinc-400 hover:text-zinc-200"
                            disabled={switchingRepo}
                            onClick={() =>
                              void switchRepo(repo.owner, repo.repo)
                            }
                          >
                            Activate
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-red-400 hover:text-red-300 hover:bg-red-950/40"
                          onClick={() =>
                            setDropTarget({
                              owner: repo.owner,
                              repo: repo.repo,
                            })
                          }
                          aria-label={`Drop ${repo.full_name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <Separator className="bg-zinc-800" />
            </>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">
              Import or create repo
            </Label>
            {loadingGhRepos ? (
              <p className="text-zinc-500 text-sm">
                Loading repositories...
              </p>
            ) : (
              <Tabs
                value={importTab}
                onValueChange={(v) =>
                  setImportTab(v as "existing" | "create")
                }
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
                    items={ghRepoItems}
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
                        onClick={() => void handleImportRepo()}
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Using repo...
                          </>
                        ) : (
                          "Use repo and continue"
                        )}
                      </Button>
                    </>
                  ) : (
                    <p className="text-zinc-500 text-sm">
                      {ghRepos.length === 0
                        ? "No repositories found."
                        : "Search and select a repo to import."}
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
                    onClick={() => void handleCreateRepo()}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create and continue"
                    )}
                  </Button>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!dropTarget}
        onOpenChange={(open) => !open && setDropTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Drop repo from server</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {dropTarget?.owner}/{dropTarget?.repo} from this
              Racksmith server? The clone will be deleted from disk. You can
              re-import it later from GitHub.
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
