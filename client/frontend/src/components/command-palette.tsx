import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Layers,
  Monitor,
  Puzzle,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { useHosts, useRackEntries, useGroups, usePlaybooks, useRoles } from "@/hooks/queries";
import { hostDisplayLabel } from "@/lib/hosts";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data: hosts = [] } = useHosts();
  const { data: rackEntries = [] } = useRackEntries();
  const { data: groups = [] } = useGroups();
  const { data: playbooks = [] } = usePlaybooks();
  const { data: roles = [] } = useRoles();

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Go to..." description="Search across hosts, racks, groups, playbooks, and roles.">
      <Command className="border border-zinc-800">
        <CommandInput placeholder="Search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {hosts.length > 0 && (
            <CommandGroup heading="Hosts">
              {hosts.map((h) => (
                <CommandItem key={h.id} onSelect={() => go(`/?host=${h.id}`)} value={`host ${hostDisplayLabel(h)} ${h.ip_address ?? ""}`}>
                  <Monitor className="size-3.5 shrink-0 text-zinc-400" />
                  <span className="truncate">{hostDisplayLabel(h)}</span>
                  {h.ip_address && (
                    <span className="ml-auto text-[11px] text-zinc-500 font-mono">{h.ip_address}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {rackEntries.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Racks">
                {rackEntries.map((entry) => (
                  <CommandItem key={entry.rack.id} onSelect={() => go(`/racks/view/${entry.rack.id}`)} value={`rack ${entry.rack.name}`}>
                    <Box className="size-3.5 shrink-0 text-zinc-400" />
                    <span className="truncate">{entry.rack.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {groups.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Groups">
                {groups.map((g) => (
                  <CommandItem key={g.id} onSelect={() => go(`/groups/${g.id}`)} value={`group ${g.name}`}>
                    <Users className="size-3.5 shrink-0 text-zinc-400" />
                    <span className="truncate">{g.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {playbooks.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Playbooks">
                {playbooks.map((p) => (
                  <CommandItem key={p.id} onSelect={() => go(`/playbooks/${p.id}`)} value={`playbook ${p.name}`}>
                    <Layers className="size-3.5 shrink-0 text-zinc-400" />
                    <span className="truncate">{p.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {roles.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Roles">
                {roles.map((r) => (
                  <CommandItem key={r.id} onSelect={() => go(`/roles/${r.id}`)} value={`role ${r.name} ${r.description ?? ""}`}>
                    <Puzzle className="size-3.5 shrink-0 text-zinc-400" />
                    <span className="truncate">{r.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
