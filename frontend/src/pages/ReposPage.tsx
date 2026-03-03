import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPost } from "@/lib/api";

type Repo = {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  clone_url: string;
  private: boolean;
};

type ClonedRepo = { owner: string; repo: string };

export function ReposPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [cloned, setCloned] = useState<ClonedRepo[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [cloning, setCloning] = useState<string | null>(null);

  const loadRepos = useCallback(async () => {
    try {
      const [reposData, clonedData] = await Promise.all([
        apiGet<{ repos: Repo[] }>("/repos"),
        apiGet<{ cloned: ClonedRepo[] }>("/repos/cloned"),
      ]);
      setRepos(reposData.repos);
      setCloned(clonedData.cloned);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load repos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  const isCloned = (owner: string, repo: string) =>
    cloned.some((c) => c.owner === owner && c.repo === repo);

  const handleClone = async (owner: string, repo: string) => {
    setCloning(`${owner}/${repo}`);
    try {
      await apiPost<{ path: string; status: string }>("/repos/clone", {
        owner,
        repo,
      });
      toast.success(`Cloned ${owner}/${repo}`);
      setCloned((prev) => [...prev.filter((c) => !(c.owner === owner && c.repo === repo)), { owner, repo }]);
      navigate(`/repos/${owner}/${repo}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clone failed");
    } finally {
      setCloning(null);
    }
  };

  const filteredRepos = repos.filter(
    (r) =>
      r.full_name.toLowerCase().includes(filter.toLowerCase()) ||
      r.owner.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-zinc-100 font-semibold hover:text-zinc-300">
            RACKSMITH
          </Link>
          <span className="text-zinc-500">/</span>
          <span className="text-zinc-400">Repositories</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">{user?.login}</span>
          <Button variant="outline" size="sm" onClick={logout}>
            Logout
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <Input
            placeholder="Search repos..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-zinc-900 border-zinc-800"
          />

          {loading ? (
            <p className="text-zinc-500 text-sm">Loading repositories...</p>
          ) : (
            <div className="space-y-2">
              {filteredRepos.map((r) => (
                <Card
                  key={r.id}
                  className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-zinc-100 truncate">
                          {r.full_name}
                        </span>
                        {r.private && (
                          <Badge variant="secondary" className="shrink-0">
                            private
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {isCloned(r.owner, r.name) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/repos/${r.owner}/${r.name}`)}
                          >
                            Open
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleClone(r.owner, r.name)}
                            disabled={cloning !== null}
                          >
                            {cloning === `${r.owner}/${r.name}` ? "Cloning..." : "Clone"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
              {filteredRepos.length === 0 && (
                <p className="text-zinc-500 text-sm py-8 text-center">
                  {repos.length === 0
                    ? "No repositories found."
                    : "No matching repositories."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
