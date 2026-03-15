import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowUpCircle, Check, Download, Loader2, RefreshCw, Shield, Trash2 } from "lucide-react";
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
import { usePlaybooks, useRegistryPlaybook } from "@/hooks/queries";
import {
  useImportPlaybookFromRegistry,
  useDeleteRegistryPlaybook,
} from "@/hooks/mutations";
import { useSetupStore } from "@/stores/setup";
import { PageContainer } from "@/components/shared/page-container";

export function RegistryPlaybookPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const currentUserLogin = useSetupStore((s) => s.status?.user?.login);

  const { data: playbook, isLoading, isError } = useRegistryPlaybook(slug ?? null);
  const { data: localPlaybooks } = usePlaybooks();
  const importMutation = useImportPlaybookFromRegistry();
  const deleteMutation = useDeleteRegistryPlaybook();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const localMatch = useMemo(() => {
    if (!slug || !localPlaybooks) return null;
    return localPlaybooks.find((p) => p.registry_id === slug) ?? null;
  }, [slug, localPlaybooks]);

  const isImported = !!localMatch;
  const regVer = playbook?.latest_version?.version_number;
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

  const isOwner =
    !!currentUserLogin && currentUserLogin === playbook?.owner?.username;

  if (!slug) {
    return (
      <PageContainer>
        <p className="text-zinc-500">Invalid playbook</p>
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
          <p className="text-sm text-zinc-400">Failed to load playbook from the registry.</p>
          <Link to="/registry" className="text-xs text-zinc-500 hover:text-zinc-300">
            Back to registry
          </Link>
        </div>
      </PageContainer>
    );
  }

  if (isLoading || !playbook) {
    return <LoadingState />;
  }

  const version = playbook.latest_version;
  const contributors = version?.contributors ?? [];
  const roleRefs = version?.roles ?? [];

  return (
    <>
    <PageContainer>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Link to="/registry" className="hover:text-zinc-300">
            Registry
          </Link>
          <span>/</span>
          <span className="text-zinc-400">{playbook.slug}</span>
        </div>

        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-zinc-100">
                  {version?.name ?? playbook.slug}
                </h1>
                {version?.become && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-700/50 bg-amber-950/30 text-[10px] text-amber-400"
                  >
                    <Shield className="size-2.5" />
                    sudo
                  </Badge>
                )}
              </div>
              <p className="text-sm text-zinc-500">
                {version?.description || "No description"}
              </p>
              <div className="flex items-center gap-2 pt-2">
                <img
                  src={playbook.owner.avatar_url}
                  alt=""
                  loading="lazy"
                  className="size-6 rounded-full"
                />
                <span className="text-xs text-zinc-500">
                  {playbook.owner.username}
                </span>
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <Download className="size-3.5" />
                  {playbook.download_count} downloads
                </span>
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
        </section>

        {/* Role Composition */}
        {roleRefs.length > 0 && (
          <Card className="border-zinc-800">
            <CardHeader>
              <h2 className="text-sm font-medium text-zinc-100">
                Role Composition
              </h2>
              <p className="text-xs text-zinc-500">
                Roles included in this playbook, executed in order
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {roleRefs.map((ref, idx) => {
                  const label = ref.role_name ?? ref.registry_role_id;
                  const inner = (
                    <div
                      className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900/30 px-3 py-2 transition-colors hover:border-zinc-600"
                    >
                      <span className="flex size-5 items-center justify-center rounded bg-zinc-800 text-[10px] font-medium text-zinc-400">
                        {idx + 1}
                      </span>
                      <span className="flex-1 truncate text-xs font-medium text-zinc-300">
                        {label}
                      </span>
                      {ref.version_number != null && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-zinc-500"
                        >
                          v{ref.version_number}
                        </Badge>
                      )}
                      {Object.keys(ref.vars).length > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-zinc-500"
                        >
                          {Object.keys(ref.vars).length} vars
                        </Badge>
                      )}
                    </div>
                  );

                  return ref.role_slug ? (
                    <Link
                      key={`${ref.registry_role_id}-${idx}`}
                      to={`/registry/${ref.role_slug}`}
                      className="block"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={`${ref.registry_role_id}-${idx}`}>{inner}</div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contributors */}
        {contributors.length > 0 && (
          <Card className="border-zinc-800">
            <CardHeader>
              <h2 className="text-sm font-medium text-zinc-100">
                Contributors
              </h2>
              <p className="text-xs text-zinc-500">
                Authors of the playbook and its roles
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {contributors.map((c) => (
                  <div
                    key={c.username}
                    className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/30 px-3 py-2"
                  >
                    <img
                      src={c.avatar_url}
                      alt=""
                      loading="lazy"
                      className="size-6 rounded-full"
                    />
                    <span className="text-xs text-zinc-300">{c.username}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
    </PageContainer>

    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete playbook from registry</AlertDialogTitle>
          <AlertDialogDescription>
            Delete &quot;{version?.name ?? playbook.slug}&quot; from the
            registry? This cannot be undone.
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
