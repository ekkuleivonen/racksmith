import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const [discardOpen, setDiscardOpen] = useState(false);
  const files = useDiffStore((s) => s.files);
  const loading = useDiffStore((s) => s.loading);
  const discarding = useDiffStore((s) => s.discarding);
  const loadDiffs = useDiffStore((s) => s.loadDiffs);
  const discardChanges = useDiffStore((s) => s.discardChanges);

  useEffect(() => {
    void loadDiffs();
  }, [loadDiffs]);

  const handleDiscard = async () => {
    try {
      await discardChanges();
      toast.success("Changes discarded");
      setDiscardOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to discard changes",
      );
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-800 shrink-0">
        <h1 className="text-lg font-semibold text-zinc-100">Review changes</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setDiscardOpen(true)}
            disabled={files.length === 0 || discarding}
          >
            Discard changes
          </Button>
          <Button
            onClick={() => navigate("/diff/commit")}
            disabled={files.length === 0}
          >
            Commit to Racksmith branch
          </Button>
        </div>
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard all changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently discard all uncommitted changes. Modified
              files will be reverted and untracked files will be removed. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDiscard();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
