import type { LocalRepo, SetupStatus } from "@/lib/setup";
import type { RackItem, RackSummary } from "@/lib/racks";
import type { PlaybookSummary } from "@/lib/playbooks";
import type { PingStatus } from "@/lib/ssh";

export type RackNavEntry = {
  rack: RackSummary;
  items: RackItem[];
};

export type SidebarProps = {
  status: SetupStatus | null;
  rackEntries: RackNavEntry[];
  playbooks: PlaybookSummary[];
  localRepos: LocalRepo[];
  pingStatuses: Record<string, PingStatus>;
  racksHref: string;
  playbooksHref: string;
  pathname: string;
  switchingRepo: boolean;
  onRepoChange: (value: string) => Promise<void>;
  onOpenPublicKey: () => void;
  onLogout: () => void;
};

export type SidebarFooterProps = Pick<
  SidebarProps,
  "status" | "localRepos" | "switchingRepo" | "onRepoChange" | "onLogout"
> & {
  onPublicKeyClick: SidebarProps["onOpenPublicKey"];
};

export type SidebarRacksSectionProps = Pick<
  SidebarProps,
  "rackEntries" | "pingStatuses"
> & {
  racksHref: string;
  pathname: string;
};

export type SidebarPlaybooksSectionProps = Pick<
  SidebarProps,
  "playbooks"
> & {
  playbooksHref: string;
  pathname: string;
};

export function itemStatusKey(rackId: string, itemId: string) {
  return `${rackId}:${itemId}`;
}
