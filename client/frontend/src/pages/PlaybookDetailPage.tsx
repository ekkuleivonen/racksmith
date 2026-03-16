import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 as PushLoader, Package, Play } from "lucide-react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";
import { DetailLoading } from "@/components/shared/detail-states";
import { PageContainer } from "@/components/shared/page-container";
import { PlaybookEditorForm } from "@/components/playbooks/playbook-editor-form";
import { PlaybookRunDialog } from "@/components/playbooks/playbook-run-dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePlaybook } from "@/hooks/queries";
import {
  deletePlaybook,
  updatePlaybook,
  type RoleCatalogEntry,
  type PlaybookUpsert,
} from "@/lib/playbooks";
import { usePushPlaybookToRegistry } from "@/hooks/mutations";

function HeaderEditableTitle({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);
  if (editing) {
    return (
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") setEditing(false);
        }}
        className="text-zinc-100 font-semibold h-auto py-1 px-2 -mx-2"
      />
    );
  }
  return (
    <h1
      className="text-zinc-100 font-semibold cursor-text rounded px-2 -mx-2 py-0.5 hover:bg-zinc-800/50"
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
    >
      {value || placeholder}
    </h1>
  );
}

function HeaderEditableDescription({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);
  if (editing) {
    return (
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") setEditing(false);
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder={placeholder}
        className="text-xs text-zinc-500 min-h-16 mt-1 -mx-2 px-2"
      />
    );
  }
  return (
    <p
      className="text-xs text-zinc-500 cursor-text rounded px-2 -mx-2 py-0.5 hover:bg-zinc-800/50 min-h-[1.25rem]"
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
    >
      {value || placeholder}
    </p>
  );
}

export function PlaybookDetailPage() {
  const { playbookId = "" } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<PlaybookUpsert | null>(null);
  const [roles_catalog, setRolesCatalog] = useState<RoleCatalogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cascadeRoles, setCascadeRoles] = useState(false);
  const savedDraftRef = useRef<PlaybookUpsert | null>(null);

  const pushMutation = usePushPlaybookToRegistry();
  const { data: playbook, isLoading: loading } = usePlaybook(playbookId || undefined);

  useEffect(() => {
    if (!playbook) return;
    const loaded = {
      name: playbook.name,
      description: playbook.description,
      roles: playbook.role_entries,
      become: playbook.become ?? false,
    };
    setDraft(loaded);
    savedDraftRef.current = loaded;
    setRolesCatalog(playbook.roles_catalog);
  }, [playbook]);

  useEffect(() => {
    if (!draft || !playbookId || !savedDraftRef.current) return;
    if (
      draft.name === savedDraftRef.current.name &&
      draft.description === savedDraftRef.current.description &&
      JSON.stringify(draft.roles) === JSON.stringify(savedDraftRef.current.roles) &&
      (draft.become ?? false) === (savedDraftRef.current.become ?? false)
    ) {
      return;
    }
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        const result = await updatePlaybook(playbookId, draft);
        const next = {
          name: result.playbook.name,
          description: result.playbook.description,
          roles: result.playbook.role_entries,
          become: result.playbook.become ?? false,
        };
        setDraft(next);
        savedDraftRef.current = next;
        setRolesCatalog(result.playbook.roles_catalog);
        toast.success("Playbook saved");
      } catch (error) {
        toastApiError(error, "Failed to save playbook");
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [draft, playbookId]);

  if (loading || !draft) return <DetailLoading message="Loading playbook..." />;

  return (
    <>
    <PageContainer>
        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <HeaderEditableTitle
                value={draft.name || playbookId}
                placeholder="Playbook name"
                onChange={(name) => setDraft((d) => (d ? { ...d, name } : d))}
              />
              <HeaderEditableDescription
                value={draft.description}
                placeholder="Double-click to add a description"
                onChange={(description) => setDraft((d) => (d ? { ...d, description } : d))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {saving && <span className="text-xs text-zinc-500">Saving...</span>}
              <Badge variant="outline">{draft.roles.length} roles</Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={pushMutation.isPending || saving}
                onClick={() => pushMutation.mutate(playbookId)}
              >
                {pushMutation.isPending ? (
                  <PushLoader className="size-3.5 animate-spin" />
                ) : (
                  <Package className="size-3.5" />
                )}
                Push to Registry
              </Button>
              <Button
                size="sm"
                onClick={() => setRunDialogOpen(true)}
              >
                <Play className="size-3.5" />
                Run
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete playbook
              </Button>
            </div>
          </div>
        </section>

        <PlaybookEditorForm
          draft={draft}
          roles={roles_catalog}
          compact
          onChange={setDraft}
        />
    </PageContainer>

      <PlaybookRunDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        hostIds={[]}
        playbookId={playbookId}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setCascadeRoles(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete playbook</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{draft?.name || playbookId}&quot;.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {draft && draft.roles.length > 0 && (
            <div className="flex items-center gap-2 py-1">
              <Checkbox
                id="cascade-roles"
                checked={cascadeRoles}
                onCheckedChange={(v) => setCascadeRoles(v === true)}
              />
              <Label htmlFor="cascade-roles" className="text-sm text-zinc-400 cursor-pointer">
                Also delete roles not used by other playbooks
              </Label>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                setDeleteDialogOpen(false);
                setSaving(true);
                try {
                  await deletePlaybook(playbookId, cascadeRoles);
                  toast.success(
                    cascadeRoles
                      ? "Playbook and orphaned roles deleted"
                      : "Playbook deleted",
                  );
                  navigate("/playbooks", { replace: true });
                } catch (error) {
                  toastApiError(error, "Failed to delete playbook");
                } finally {
                  setSaving(false);
                  setCascadeRoles(false);
                }
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
