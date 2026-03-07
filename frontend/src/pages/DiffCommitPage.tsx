import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useDiffStore } from "@/stores/diff";
import { useSetupStore } from "@/stores/setup";

export function DiffCommitPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const files = useDiffStore((s) => s.files);
  const loading = useDiffStore((s) => s.loading);
  const committing = useDiffStore((s) => s.committing);
  const loadDiffs = useDiffStore((s) => s.loadDiffs);
  const commitAndPush = useDiffStore((s) => s.commitAndPush);
  const repo = useSetupStore((s) => s.status?.repo);

  useEffect(() => {
    void loadDiffs();
  }, [loadDiffs]);

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed || committing) return;
    try {
      const { pr_url } = await commitAndPush(trimmed);
      toast.success("Changes pushed to racksmith branch");
      if (pr_url) {
        window.open(pr_url, "_blank", "noopener,noreferrer");
      }
      navigate("/diff/review", { replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to commit and push",
      );
    }
  };

  const mergeUrl =
    repo?.owner && repo?.repo
      ? `https://github.com/${repo.owner}/${repo.repo}/compare/main...racksmith`
      : null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-zinc-800 shrink-0">
        <h1 className="text-lg font-semibold text-zinc-100">
          Commit changes
        </h1>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {loading ? (
          <p className="text-zinc-500 text-sm">Loading...</p>
        ) : (
          <>
            <div>
              <h2 className="text-sm font-medium text-zinc-300 mb-2">
                Changed files
              </h2>
              {files.length === 0 ? (
                <p className="text-zinc-500 text-sm">
                  No changes to commit
                </p>
              ) : (
                <ul className="space-y-1">
                  {files.map((file) => (
                    <li
                      key={file.path}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="font-mono text-zinc-300 truncate">
                        {file.path}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 text-[10px] opacity-75",
                          file.status === "modified" &&
                            "text-amber-300 border-amber-300/50",
                          file.status === "untracked" &&
                            "text-green-600 border-green-600/50",
                        )}
                      >
                        {file.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label
                htmlFor="commit-message"
                className="block text-sm font-medium text-zinc-300 mb-2"
              >
                Commit message
              </label>
              <Textarea
                id="commit-message"
                placeholder="Describe your changes..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-24 font-mono text-sm"
                disabled={files.length === 0}
              />
            </div>

            <div className="flex items-center gap-4">
              <Button
                onClick={() => void handleSubmit()}
                disabled={
                  !message.trim() || files.length === 0 || committing
                }
              >
                {committing ? "Pushing..." : "Commit & push"}
              </Button>
              {mergeUrl && (
                <a
                  href={mergeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Merge on GitHub
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
