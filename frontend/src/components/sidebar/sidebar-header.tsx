import { Link } from "react-router-dom";
import { useSetupStore } from "@/stores/setup";

export function SidebarHeader() {
  const repoFullName = useSetupStore((s) => s.status?.repo?.full_name);

  return (
    <div className="space-y-1 px-3 py-2">
      <Link
        to="/"
        className="text-sm text-zinc-100 font-semibold tracking-wide hover:text-zinc-200 block"
      >
        RACKSMITH
      </Link>
      <p className="text-[10px] text-zinc-500">{repoFullName ?? ""}</p>
    </div>
  );
}
