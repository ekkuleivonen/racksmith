import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowUpCircle, Check, Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { LoadingState } from "@/components/shared/loading-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRegistryRole, useRoles } from "@/hooks/queries";
import { useImportFromRegistry, useDeleteRegistryRole } from "@/hooks/mutations";
import { useSetupStore } from "@/stores/setup";
import { PageContainer } from "@/components/shared/page-container";

export function RegistryRolePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const currentUserLogin = useSetupStore((s) => s.status?.user?.login);

  const { data: role, isLoading, isError } = useRegistryRole(slug ?? null);
  const { data: localRoles } = useRoles();
  const importMutation = useImportFromRegistry();
  const deleteMutation = useDeleteRegistryRole();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const localMatch = useMemo(() => {
    if (!slug || !localRoles) return null;
    return localRoles.find((r) => r.registry_id === slug) ?? null;
  }, [slug, localRoles]);

  const isImported = !!localMatch;
  const regVer = role?.latest_version?.version_number;
  const localVer = localMatch?.registry_version;
  const versionTracked = isImported && localVer != null && localVer > 0;
  const upgradeAvailable = versionTracked && regVer != null && regVer > localVer;
  const isUpToDate = versionTracked && regVer != null && regVer <= localVer;
  const versionUnknown = isImported && !versionTracked;

  const handleImport = () => {
    if (!slug) return;
    importMutation.mutate(slug);
  };

  const handleDelete = () => {
    if (!slug) return;
    deleteMutation.mutate(slug, {
      onSuccess: () => navigate("/registry"),
    });
  };

  const isOwner = !!currentUserLogin && currentUserLogin === role?.owner?.username;

  if (!slug) {
    return (
      <PageContainer>
        <p className="text-zinc-500">Invalid role</p>
        <Link to="/registry" className="text-zinc-400 hover:text-zinc-100">
          Back to registry
        </Link>
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center gap-3 py-16">
          <AlertTriangle className="size-8 text-red-400" />
          <p className="text-sm text-zinc-400">Failed to load role from the registry.</p>
          <Link to="/registry" className="text-xs text-zinc-500 hover:text-zinc-300">
            Back to registry
          </Link>
        </div>
      </PageContainer>
    );
  }

  if (isLoading || !role) {
    return <LoadingState />;
  }

  const version = role.latest_version;
  const inputs = (version?.inputs ?? []) as Array<{
    key?: string;
    label?: string;
    type?: string;
    default?: unknown;
  }>;

  return (
    <>
    <PageContainer>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Link to="/registry" className="hover:text-zinc-300">
            Registry
          </Link>
          <span>/</span>
          <span className="text-zinc-400">{role.slug}</span>
        </div>

        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h1 className="text-xl font-semibold text-zinc-100">
                {version?.name ?? role.slug}
              </h1>
              <p className="text-sm text-zinc-500">
                {version?.description || "No description"}
              </p>
              <div className="flex items-center gap-2 pt-2">
                <img
                  src={role.owner.avatar_url}
                  alt=""
                  loading="lazy"
                  className="size-6 rounded-full"
                />
                <span className="text-xs text-zinc-500">
                  {role.owner.username}
                </span>
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <Download className="size-3.5" />
                  {role.download_count + (role.playbook_download_count ?? 0)} downloads
                </span>
                {role.playbook_download_count > 0 && (
                  <span className="text-[10px] text-zinc-600">
                    ({role.download_count} direct + {role.playbook_download_count} via playbooks)
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {upgradeAvailable ? (
                <div className="flex flex-col items-end gap-1">
                  <Button onClick={handleImport} disabled={importMutation.isPending}>
                    {importMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowUpCircle className="size-4" />
                    )}
                    Upgrade to v{regVer}
                  </Button>
                  <span className="text-[10px] text-zinc-600">
                    v{localVer} installed
                  </span>
                </div>
              ) : isUpToDate ? (
                <Button variant="outline" disabled>
                  <Check className="size-4" />
                  Up to date &middot; v{localVer}
                </Button>
              ) : versionUnknown ? (
                <Button onClick={handleImport} disabled={importMutation.isPending} variant="outline">
                  {importMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Re-import
                </Button>
              ) : (
                <Button onClick={handleImport} disabled={importMutation.isPending}>
                  {importMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Import to my repo
                </Button>
              )}
              {isOwner && (
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={deleteMutation.isPending}
                  className="text-red-400 hover:text-red-300"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Delete
                </Button>
              )}
            </div>
          </div>

          {version?.tags?.length ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {version.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}

          {version?.platforms?.length ? (
            <p className="mt-2 text-xs text-zinc-500">
              Platforms:{" "}
              {version.platforms
                .map((p) => (typeof p === "object" && p.name ? p.name : String(p)))
                .join(", ")}
            </p>
          ) : null}
        </section>

        {inputs.length > 0 ? (
          <Card className="border-zinc-800">
            <CardHeader>
              <h2 className="text-sm font-medium text-zinc-100">Inputs</h2>
              <p className="text-xs text-zinc-500">
                Variables you can configure when using this action
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead className="text-zinc-500">Variable</TableHead>
                    <TableHead className="text-zinc-500">Type</TableHead>
                    <TableHead className="text-zinc-500">Default</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inputs.map((inp) => (
                    <TableRow key={inp.key} className="border-zinc-800">
                      <TableCell className="font-mono text-xs">
                        {inp.label || inp.key}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {inp.type ?? "string"}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {inp.default != null ? String(inp.default) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

    </PageContainer>

    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete role from registry</AlertDialogTitle>
          <AlertDialogDescription>
            Delete &quot;{version?.name ?? role.slug}&quot; from the registry?
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => {
              setShowDeleteDialog(false);
              handleDelete();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
