import { useSetupStore } from "@/stores/setup";

export function SidebarHeader() {
  const repoFullName = useSetupStore((s) => s.status?.repo?.full_name);

  return (
    <div className="space-y-1">
      <p className="text-sm text-zinc-100 font-semibold tracking-wide">
        RACKSMITH
      </p>
      <p className="text-[10px] text-zinc-500">{repoFullName ?? ""}</p>
    </div>
  );
}
