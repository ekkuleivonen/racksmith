import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { useDiffStore } from "@/stores/diff";

function DiffViewer({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="font-mono text-xs whitespace-pre-wrap break-words">
      {lines.map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith("+") && !line.startsWith("+++")
              ? "text-green-600"
              : line.startsWith("-") && !line.startsWith("---")
                ? "text-red-600"
                : ""
          }
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

export function DiffReviewPage() {
  const navigate = useNavigate();
  const files = useDiffStore((s) => s.files);
  const loading = useDiffStore((s) => s.loading);
  const loadDiffs = useDiffStore((s) => s.loadDiffs);

  useEffect(() => {
    void loadDiffs();
  }, [loadDiffs]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-800 shrink-0">
        <h1 className="text-lg font-semibold text-zinc-100">Review changes</h1>
        <Button
          onClick={() => navigate("/diff/commit")}
          disabled={files.length === 0}
        >
          Commit to Racksmith branch
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-zinc-500 text-sm">Loading...</div>
        ) : files.length === 0 ? (
          <div className="p-6 text-zinc-500 text-sm">
            No changes to commit
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-6 space-y-2">
              <Accordion type="multiple" className="w-full">
                {files.map((file) => (
                  <AccordionItem key={file.path} value={file.path}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2 text-left">
                        <span className="font-mono text-xs truncate">
                          {file.path}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 text-[10px] opacity-75",
                            file.status === "modified" && "text-amber-300 border-amber-300/50",
                            file.status === "untracked" && "text-green-600 border-green-600/50",
                          )}
                        >
                          {file.status}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ScrollArea className="h-[200px] rounded border border-zinc-800 bg-zinc-900/50 p-3">
                        <DiffViewer diff={file.diff} />
                      </ScrollArea>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
