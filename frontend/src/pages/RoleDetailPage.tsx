import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { YamlCodeView } from "@/components/code/yaml-code-view";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { queryKeys } from "@/lib/queryClient";
import {
  deleteRole,
  getRoleDetail,
  updateRole,
  type RoleDetail,
  type RoleInput,
} from "@/lib/roles";
import { pushToRegistry } from "@/lib/registry";

export function RoleDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [yamlText, setYamlText] = useState("");
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: role, isLoading } = useQuery({
    queryKey: ["role-detail", slug],
    queryFn: async () => {
      const { role } = await getRoleDetail(slug!);
      return role;
    },
    enabled: !!slug,
  });

  function startEditing(detail: RoleDetail) {
    setYamlText(detail.raw_content);
    setEditing(true);
  }

  async function handleSave() {
    if (!slug) return;
    setSaving(true);
    try {
      await updateRole(slug, yamlText);
      queryClient.invalidateQueries({ queryKey: ["role-detail", slug] });
      queryClient.invalidateQueries({ queryKey: queryKeys.playbooks });
      setEditing(false);
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handlePush() {
    if (!slug) return;
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

  async function handleDelete() {
    if (!slug) return;
    setDeleting(true);
    try {
      await deleteRole(slug);
      queryClient.invalidateQueries({ queryKey: queryKeys.playbooks });
      toast.success("Role deleted");
      navigate("/roles");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  if (!slug) {
    return (
      <div className="p-6 text-zinc-500">
        Invalid role. <Link to="/roles" className="hover:text-zinc-100">Back</Link>
      </div>
    );
  }

  if (isLoading || !role) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-6 text-zinc-500">
        <Loader2 className="size-4 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Link to="/roles" className="hover:text-zinc-300">Roles</Link>
          <span>/</span>
          <span className="text-zinc-400">{role.slug}</span>
        </div>

        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h1 className="text-xl font-semibold text-zinc-100">
                {role.name}
              </h1>
              {role.description && (
                <p className="text-sm text-zinc-500">{role.description}</p>
              )}
              <p className="text-[11px] font-mono text-zinc-600">
                {role.slug}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePush}
                disabled={pushing}
              >
                {pushing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                Push to registry
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-400 hover:text-red-300"
              >
                {deleting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Delete
              </Button>
            </div>
          </div>

          {role.labels.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {role.labels.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </section>

        {role.inputs.length > 0 && (
          <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-2">
            <h2 className="text-sm font-medium text-zinc-100">Inputs</h2>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-500">Variable</TableHead>
                  <TableHead className="text-zinc-500">Type</TableHead>
                  <TableHead className="text-zinc-500">Default</TableHead>
                  <TableHead className="text-zinc-500">Required</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {role.inputs.map((inp: RoleInput) => (
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
                    <TableCell className="text-xs text-zinc-500">
                      {inp.required ? "Yes" : "No"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}

        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-100">Role YAML</h2>
            {!editing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => startEditing(role)}
              >
                Edit
              </Button>
            )}
          </div>

          {editing ? (
            <>
              <div className="border border-zinc-800 rounded-md overflow-hidden">
                <YamlCodeView
                  value={yamlText}
                  onChange={setYamlText}
                  readOnly={false}
                  height="400px"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  Save
                </Button>
              </div>
            </>
          ) : (
            <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400 font-mono max-h-[500px]">
              {role.raw_content}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
