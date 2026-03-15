import { Link } from "react-router-dom";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityListPage } from "@/components/shared/entity-list-page";
import { useRoles } from "@/hooks/queries";
import { usePushToRegistry } from "@/hooks/mutations";
import type { RoleSummary } from "@/lib/roles";

function PushButton({ roleId }: { roleId: string }) {
  const pushMutation = usePushToRegistry();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        pushMutation.mutate(roleId, {
          onSuccess: () => toast.success("Role pushed to registry"),
        });
      }}
      disabled={pushMutation.isPending}
      title="Push to registry"
    >
      {pushMutation.isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Upload className="size-3.5" />
      )}
      Push
    </Button>
  );
}

export function RolesPage() {
  const { data: roles = [], isLoading } = useRoles();

  return (
    <EntityListPage
      title="Roles"
      description="Ansible roles in your repository. Create new ones or push existing roles to the community registry."
      createPath="/roles/create"
      createLabel="Create"
      isLoading={isLoading}
      isEmpty={roles.length === 0}
      emptyTitle="No roles yet."
      emptySecondaryAction={{ label: "Import from registry", path: "/registry" }}
    >
      <div className="space-y-2">
        {roles.map((role: RoleSummary) => (
          <Link
            key={role.id}
            to={`/roles/${role.id}`}
            className="flex items-center justify-between gap-4 rounded border border-zinc-800 bg-zinc-950/40 px-4 py-3 transition-colors hover:border-zinc-700"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-zinc-100">
                  {role.name}
                </span>
                <span className="text-[11px] text-zinc-600 font-mono">
                  {role.id}
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
            <PushButton roleId={role.id} />
          </Link>
        ))}
      </div>
    </EntityListPage>
  );
}
