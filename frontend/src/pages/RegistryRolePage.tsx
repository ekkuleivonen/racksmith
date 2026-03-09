import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useRegistryRole,
  useRegistryRoleVersions,
} from "@/hooks/queries";
import { importFromRegistry } from "@/lib/registry";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";

export function RegistryRolePage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);

  const { data: role, isLoading } = useRegistryRole(slug ?? null);
  const { data: versions = [] } = useRegistryRoleVersions(slug ?? null);

  const handleImport = async () => {
    if (!slug) return;
    setImporting(true);
    try {
      const result = await importFromRegistry(slug);
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: queryKeys.codeTree });
      queryClient.invalidateQueries({ queryKey: queryKeys.stacks });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (!slug) {
    return (
      <div className="p-6">
        <p className="text-zinc-500">Invalid role</p>
        <Link to="/registry" className="text-zinc-400 hover:text-zinc-100">
          Back to registry
        </Link>
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

  const version = role.latest_version;
  const inputs = (version?.inputs ?? []) as Array<{
    key?: string;
    label?: string;
    type?: string;
    default?: unknown;
  }>;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-4">
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
                  className="size-6 rounded-full"
                />
                <span className="text-xs text-zinc-500">
                  {role.owner.username}
                </span>
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <Download className="size-3.5" />
                  {role.download_count} downloads
                </span>
              </div>
            </div>
            <Button
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Import to my repo
            </Button>
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
              Platforms: {version.platforms.join(", ")}
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
                        {inp.label ?? inp.key}
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

        {versions.length > 1 ? (
          <Accordion type="single" collapsible className="border border-zinc-800">
            <AccordionItem value="versions">
              <AccordionTrigger>Version history ({versions.length})</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pt-2">
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2"
                    >
                      <div>
                        <span className="text-sm text-zinc-100">
                          v{v.version_number}
                        </span>
                        <span className="ml-2 text-xs text-zinc-500">
                          racksmith {v.racksmith_version}
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        {new Date(v.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
      </div>
    </div>
  );
}
