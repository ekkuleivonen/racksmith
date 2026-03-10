import { NavLink } from "react-router-dom";
import { Server, Terminal, BookOpen, Box, Code } from "lucide-react";
import { useHosts, useRackEntries, usePlaybooks } from "@/hooks/queries";
import { cn } from "@/lib/utils";

const quickLinks = [
  { to: "/racks", label: "Racks", icon: Server, desc: "Hardware topology" },
  { to: "/hosts", label: "Hosts", icon: Terminal, desc: "Managed nodes" },
  { to: "/playbooks", label: "Playbooks", icon: BookOpen, desc: "Ansible stacks" },
  { to: "/roles", label: "Roles", icon: Box, desc: "Reusable roles" },
  { to: "/code", label: "Code", icon: Code, desc: "Edit in browser" },
];

export function HomeDashboard() {
  const { data: hosts = [] } = useHosts();
  const { data: rackEntries = [] } = useRackEntries();
  const { data: playbooks = [] } = usePlaybooks();

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <section>
          <h1 className="text-zinc-100 font-semibold text-lg">Overview</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Your infrastructure at a glance.
          </p>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="border border-zinc-800 bg-zinc-900/30 p-4 rounded">
              <p className="text-2xl font-medium text-zinc-100">
                {hosts.filter((h) => h.managed).length}
              </p>
              <p className="text-xs text-zinc-500">Managed hosts</p>
            </div>
            <div className="border border-zinc-800 bg-zinc-900/30 p-4 rounded">
              <p className="text-2xl font-medium text-zinc-100">
                {rackEntries.length}
              </p>
              <p className="text-xs text-zinc-500">Racks</p>
            </div>
            <div className="border border-zinc-800 bg-zinc-900/30 p-4 rounded">
              <p className="text-2xl font-medium text-zinc-100">
                {playbooks.length}
              </p>
              <p className="text-xs text-zinc-500">Playbooks</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-zinc-100 font-semibold">Quick links</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Jump to a section of your infrastructure.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
            {quickLinks.map(({ to, label, icon: Icon, desc }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-4 border border-zinc-800 bg-zinc-900/30 p-4 transition-colors",
                    isActive
                      ? "border-zinc-600 bg-zinc-800/50"
                      : "hover:border-zinc-700 hover:bg-zinc-900/50"
                  )
                }
              >
                <div className="shrink-0 w-10 h-10 rounded bg-zinc-800 flex items-center justify-center">
                  <Icon className="size-5 text-zinc-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-zinc-100 font-medium">{label}</p>
                  <p className="text-xs text-zinc-500 truncate">{desc}</p>
                </div>
              </NavLink>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
