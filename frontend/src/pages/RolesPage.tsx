import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Loader2, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/queryClient";
import { listRoles, type RoleSummary } from "@/lib/roles";
import { pushToRegistry } from "@/lib/registry";

function useLocalRoles() {
  return useQuery({
    queryKey: [...queryKeys.playbooks, "roles-catalog"],
    queryFn: async () => {
      const { roles } = await listRoles();
      return roles;
    },
  });
}

function PushButton({ slug }: { slug: string }) {
  const [pushing, setPushing] = useState(false);
  const queryClient = useQueryClient();

  async function handlePush() {
    setPushing(true);
    try {
      await pushToRegistry(slug);
      toast.success(`"${slug}" pushed to registry`);
      queryClient.invalidateQueries({ queryKey: queryKeys.registry });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Push failed");
    } finally {
      setPushing(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handlePush();
      }}
      disabled={pushing}
      title="Push to registry"
    >
      {pushing ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Upload className="size-3.5" />
      )}
      Push
    </Button>
  );
}

export function RolesPage() {
  const { data: roles = [], isLoading } = useLocalRoles();

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-zinc-100 font-semibold">Roles</h1>
            <p className="text-xs text-zinc-500">
              Ansible roles in your repository. Create new ones or push
              existing roles to the community registry.
            </p>
          </div>
          <NavLink to="/roles/create">
            <Button size="sm">
              <Plus className="size-3.5" />
              Create
            </Button>
          </NavLink>
        </section>

        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-zinc-500">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Loading roles...</span>
            </div>
          ) : roles.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-zinc-500">No roles yet.</p>
              <div className="flex justify-center gap-3">
                <NavLink to="/roles/create">
                  <Button variant="outline" size="sm">
                    <Plus className="size-3.5" />
                    Create a role
                  </Button>
                </NavLink>
                <NavLink to="/registry">
                  <Button variant="outline" size="sm">
                    Import from registry
                  </Button>
                </NavLink>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {roles.map((role: RoleSummary) => (
                <Link
                  key={role.slug}
                  to={`/roles/${role.slug}`}
                  className="flex items-center justify-between gap-4 rounded border border-zinc-800 bg-zinc-950/40 px-4 py-3 transition-colors hover:border-zinc-700"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-zinc-100">
                        {role.name}
                      </span>
                      <span className="text-[11px] text-zinc-600 font-mono">
                        {role.slug}
                      </span>
                    </div>
                    {role.description && (
                      <p className="text-xs text-zinc-500 line-clamp-1">
                        {role.description}
                      </p>
                    )}
                    {role.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {role.labels.slice(0, 5).map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <PushButton slug={role.slug} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
