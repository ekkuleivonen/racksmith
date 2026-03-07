type SidebarHeaderProps = {
  repoFullName?: string | null;
};

export function SidebarHeader({ repoFullName }: SidebarHeaderProps) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-zinc-100 font-semibold tracking-wide">
        RACKSMITH
      </p>
      <p className="text-[10px] text-zinc-500">{repoFullName ?? ""}</p>
    </div>
  );
}
