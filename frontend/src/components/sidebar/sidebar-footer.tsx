import { useNavigate } from "react-router-dom";
import { GitBranch, KeyRound, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSetupStore } from "@/stores/setup";
import { useGitStatuses, useHosts } from "@/hooks/queries";

export const MANAGE_REPOS_VALUE = "__manage_repos__";

type SidebarFooterProps = {
  onLogout: () => void;
};

export function SidebarFooter({ onLogout }: SidebarFooterProps) {
  const navigate = useNavigate();

  const status = useSetupStore((s) => s.status);
  const openPublicKey = useSetupStore((s) => s.openPublicKey);
  const syncRepo = useSetupStore((s) => s.syncRepo);
  const syncing = useSetupStore((s) => s.syncing);
  const localRepos = useSetupStore((s) => s.localRepos);
  const switchingRepo = useSetupStore((s) => s.switchingRepo);
  const switchRepo = useSetupStore((s) => s.switchRepo);
  const { data: gitData } = useGitStatuses();
  const { data: hosts = [] } = useHosts();
  const modifiedPaths = gitData?.modifiedPaths ?? {};
  const untrackedPaths = gitData?.untrackedPaths ?? {};

  const changeCount =
    Object.keys(modifiedPaths).length + Object.keys(untrackedPaths).length;

  const handleRepoChange = async (value: string) => {
    if (!value || switchingRepo) return;
    if (value === MANAGE_REPOS_VALUE) {
      navigate("/repos");
      return;
    }
    const [owner, repo] = value.split("/", 2);
    if (!owner || !repo) return;
    await switchRepo(owner, repo);
    const newStatus = useSetupStore.getState().status;
    const firstManaged = hosts.find((h) => h.managed);
    const path = newStatus?.nodes_ready && firstManaged
      ? `/hosts/${firstManaged.id}`
      : "/hosts";
    navigate(path, { replace: true });
  };

  return (
    <div className="mt-auto space-y-3">
      <div className="flex items-center gap-2">
        <Select
          disabled={switchingRepo}
          value={
            status?.repo ? `${status.repo.owner}/${status.repo.repo}` : ""
          }
          onValueChange={handleRepoChange}
        >
          <SelectTrigger className="min-w-0 flex-1 text-[10px]" size="sm">
            <SelectValue placeholder="Select repo" />
          </SelectTrigger>
          <SelectContent>
            {localRepos.map((repo) => (
              <SelectItem
                key={repo.full_name}
                value={`${repo.owner}/${repo.repo}`}
              >
                {repo.full_name}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value={MANAGE_REPOS_VALUE}>
              Create or manage repos
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="size-7 shrink-0"
          disabled={!status?.repo_ready || syncing}
          onClick={() => void syncRepo()}
          aria-label="Sync repo"
          title="Rebase racksmith branch on main"
        >
          <RefreshCw
            className={`size-3 ${syncing ? "animate-spin" : ""}`}
          />
        </Button>
        <div className="relative shrink-0 overflow-visible">
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            disabled={changeCount === 0}
            onClick={() => navigate("/diff/review")}
            aria-label="Review changes"
            title="Review changes"
          >
            <GitBranch className="size-3" />
          </Button>
          {changeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[12px] h-3 px-0.5 flex items-center justify-center rounded-full bg-yellow-500 text-[9px] font-medium text-zinc-900 pointer-events-none">
              {changeCount > 99 ? "99+" : changeCount}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => void openPublicKey()}
          aria-label="Show Racksmith public key"
          title="Show Racksmith public key"
        >
          <KeyRound className="size-3" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-7 shrink-0"
          onClick={onLogout}
          aria-label="Logout"
          title="Logout"
        >
          <LogOut className="size-3" />
        </Button>
      </div>
    </div>
  );
}
