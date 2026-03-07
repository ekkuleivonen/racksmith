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
import type { SidebarFooterProps } from "./types";

export const MANAGE_REPOS_VALUE = "__manage_repos__";

export function SidebarFooter({
  status,
  localRepos,
  switchingRepo,
  onRepoChange,
  onPublicKeyClick,
  onLogout,
}: SidebarFooterProps) {
  const navigate = useNavigate();

  return (
    <div className="mt-auto space-y-3">
      <div className="flex items-center gap-2">
        <Select
          disabled={switchingRepo}
          value={
            status?.repo ? `${status.repo.owner}/${status.repo.repo}` : ""
          }
          onValueChange={(value) => {
            if (!value || switchingRepo) return;
            if (value === MANAGE_REPOS_VALUE) {
              navigate("/?manageRepos=1");
              return;
            }
            onRepoChange(value);
          }}
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
          onClick={onPublicKeyClick}
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
