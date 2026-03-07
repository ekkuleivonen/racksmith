import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
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
import { useRackStore } from "@/stores/racks";

export const MANAGE_REPOS_VALUE = "__manage_repos__";

type SidebarFooterProps = {
  onLogout: () => void;
};

export function SidebarFooter({ onLogout }: SidebarFooterProps) {
  const navigate = useNavigate();

  const status = useSetupStore((s) => s.status);
  const openPublicKey = useSetupStore((s) => s.openPublicKey);
  const localRepos = useSetupStore((s) => s.localRepos);
  const switchingRepo = useSetupStore((s) => s.switchingRepo);
  const switchRepo = useSetupStore((s) => s.switchRepo);

  const handleRepoChange = async (value: string) => {
    if (!value || switchingRepo) return;
    if (value === MANAGE_REPOS_VALUE) {
      navigate("/?manageRepos=1");
      return;
    }
    const [owner, repo] = value.split("/", 2);
    if (!owner || !repo) return;
    await switchRepo(owner, repo);
    const newStatus = useSetupStore.getState().status;
    const newRackEntries = useRackStore.getState().rackEntries;
    const path =
      newStatus?.rack_ready && newRackEntries[0]
        ? `/rack/view/${newRackEntries[0].rack.id}`
        : "/rack/create";
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
          onClick={() => void openPublicKey()}
          aria-label="Show Racksmith public key"
          title="Show Racksmith public key"
        >
          <KeyRound className="size-3" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-7 px-2 text-[10px]"
          onClick={onLogout}
        >
          Logout
        </Button>
      </div>
    </div>
  );
}
