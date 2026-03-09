import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRegistryRoles } from "@/hooks/queries";

export function RegistryPage() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "downloads" | "name">("recent");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const { data, isLoading } = useRegistryRoles({
    q: q || undefined,
    sort,
    page,
    per_page: perPage,
  });

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-1">
          <h1 className="text-zinc-100 font-semibold">Registry</h1>
          <p className="text-xs text-zinc-500">
            Browse and import community actions from the Racksmith registry.
          </p>
        </section>

        <section className="space-y-3 border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                placeholder="Search actions..."
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                className="pl-8"
              />
            </div>
            <Select
              value={sort}
              onValueChange={(v) => {
                setSort(v as "recent" | "downloads" | "name");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recent</SelectItem>
                <SelectItem value="downloads">Downloads</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-zinc-500">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Loading registry...</span>
            </div>
          ) : data?.items.length === 0 ? (
            <p className="py-8 text-sm text-zinc-500">
              No actions found. Try a different search or sort.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data?.items.map((role) => (
                <Link
                  key={role.id}
                  to={`/registry/${role.slug}`}
                  className="block"
                >
                  <Card className="border-zinc-800 bg-zinc-950/40 transition-colors hover:border-zinc-700">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-medium text-zinc-100">
                            {role.latest_version?.name ?? role.slug}
                          </p>
                          <p className="line-clamp-2 text-xs text-zinc-500">
                            {role.latest_version?.description || "No description"}
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <img
                              src={role.owner.avatar_url}
                              alt=""
                              className="size-5 rounded-full"
                            />
                            <span className="text-[11px] text-zinc-500">
                              {role.owner.username}
                            </span>
                            <span className="text-[11px] text-zinc-600">•</span>
                            <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                              <Download className="size-3" />
                              {role.download_count}
                            </span>
                          </div>
                        </div>
                      </div>
                      {role.latest_version?.tags?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {role.latest_version.tags.slice(0, 5).map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-400"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {data && data.total > perPage ? (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-zinc-500">
                {data.items.length} of {data.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * perPage >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
