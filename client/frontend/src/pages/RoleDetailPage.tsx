import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Info, Loader2, Trash2, Upload } from "lucide-react";
import { DetailLoading, DetailNotFound } from "@/components/shared/detail-states";
import { MarkdownContent } from "@/components/shared/markdown-content";
import { PageContainer } from "@/components/shared/page-container";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { YamlEditorWithAi } from "@/components/roles/yaml-editor-with-ai";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRoleDetail } from "@/hooks/queries";
import { useDeleteRole, usePushToRegistry, useUpdateRole } from "@/hooks/mutations";
import type { RoleDetail, RoleInput, RoleOutput } from "@/lib/roles";

export function RoleDetailPage() {
  const { roleId } = useParams<{ roleId: string }>();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [yamlText, setYamlText] = useState("");
  const [generating, setGenerating] = useState(false);

  const { data: role, isLoading } = useRoleDetail(roleId);
  const saveMutation = useUpdateRole(roleId!);
  const pushMutation = usePushToRegistry();
  const deleteMutation = useDeleteRole();

  function startEditing(detail: RoleDetail) {
    setYamlText(detail.raw_content);
    setEditing(true);
  }

  function handleSave() {
    if (!roleId) return;
    saveMutation.mutate(yamlText, {
      onSuccess: () => setEditing(false),
    });
  }

  function handlePush() {
    if (!role?.id) return;
    pushMutation.mutate(role.id, {
      onSuccess: () => toast.success("Role pushed to registry"),
    });
  }

  function handleDelete() {
    if (!roleId) return;
    deleteMutation.mutate(roleId, {
      onSuccess: () => navigate("/roles"),
    });
  }

  if (!roleId) return <DetailNotFound title="Invalid role" description="The role ID is missing or invalid." backPath="/roles" backLabel="Back to roles" />;
  if (isLoading || !role) return <DetailLoading message="Loading role..." />;

  return (
    <PageContainer>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Link to="/roles" className="hover:text-zinc-300">Roles</Link>
          <span>/</span>
          <span className="text-zinc-400">{role.id}</span>
        </div>

        <section className="border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h1 className="text-xl font-semibold text-zinc-100">
                {role.name}
              </h1>
              {role.description && (
                <MarkdownContent className="text-zinc-500">{role.description}</MarkdownContent>
              )}
              <p className="text-[11px] font-mono text-zinc-600">
                {role.id}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePush}
                disabled={pushMutation.isPending}
              >
                {pushMutation.isPending ? (
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
                      <span className="inline-flex items-center gap-1.5">
                        {inp.label || inp.key}
                        {inp.description ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="size-3 shrink-0 text-zinc-600 hover:text-zinc-400" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-64">
                              {inp.description}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </span>
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

        {(role.outputs?.length ?? 0) > 0 && (
          <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-2">
            <h2 className="text-sm font-medium text-zinc-100">Outputs</h2>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-500">Fact</TableHead>
                  <TableHead className="text-zinc-500">Type</TableHead>
                  <TableHead className="text-zinc-500">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {role.outputs!.map((out: RoleOutput) => (
                  <TableRow key={out.key} className="border-zinc-800">
                    <TableCell className="font-mono text-xs">
                      {out.key}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {out.type ?? "string"}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {out.description || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}

        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <YamlEditorWithAi
            value={editing ? yamlText : role.raw_content}
            onChange={setYamlText}
            apiEndpoint="/roles/edit-generate"
            buildBody={(prompt) => ({
              existing_yaml: editing ? yamlText : role.raw_content,
              prompt,
            })}
            editorHidden={!editing}
            onBeforeGenerate={() => {
              setYamlText("");
              setEditing(true);
            }}
            headerActions={
              !editing ? (
                <Button variant="outline" size="sm" onClick={() => startEditing(role)}>
                  Edit
                </Button>
              ) : undefined
            }
            generateButtonLabel="Edit"
            placeholder='Describe changes, e.g. "Add a handler to restart the service on config change"'
            headerTitle="Role YAML"
            onGeneratingChange={setGenerating}
          />

          {editing && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={generating}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveMutation.isPending || generating}
              >
                {saveMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          )}
        </section>
    </PageContainer>
  );
}
