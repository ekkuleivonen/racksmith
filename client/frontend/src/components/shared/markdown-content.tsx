import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const proseClasses = [
  "prose-sm max-w-none text-zinc-400",
  "[&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-zinc-200 [&_h1]:mt-4 [&_h1]:mb-2",
  "[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-zinc-200 [&_h2]:mt-3 [&_h2]:mb-1.5",
  "[&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-zinc-300 [&_h3]:mt-2 [&_h3]:mb-1",
  "[&_p]:text-sm [&_p]:leading-relaxed [&_p]:my-1.5",
  "[&_ul]:my-1.5 [&_ul]:pl-5 [&_ul]:list-disc",
  "[&_ol]:my-1.5 [&_ol]:pl-5 [&_ol]:list-decimal",
  "[&_li]:text-sm [&_li]:leading-relaxed [&_li]:my-0.5",
  "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-zinc-800 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-xs [&_:not(pre)>code]:text-zinc-300 [&_:not(pre)>code]:font-mono",
  "[&_pre]:my-2 [&_pre]:rounded [&_pre]:bg-zinc-950 [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:p-3 [&_pre]:overflow-x-auto",
  "[&_pre_code]:text-xs [&_pre_code]:text-zinc-300 [&_pre_code]:font-mono [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-500 [&_blockquote]:italic",
  "[&_table]:my-2 [&_table]:w-full [&_table]:text-xs",
  "[&_th]:border [&_th]:border-zinc-800 [&_th]:bg-zinc-900/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium [&_th]:text-zinc-300",
  "[&_td]:border [&_td]:border-zinc-800 [&_td]:px-2 [&_td]:py-1 [&_td]:text-zinc-400",
  "[&_a]:text-blue-400 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-blue-300",
  "[&_hr]:my-3 [&_hr]:border-zinc-800",
  "[&_strong]:text-zinc-200 [&_strong]:font-semibold",
  "[&>*:first-child]:mt-0",
];

interface MarkdownContentProps {
  children: string;
  className?: string;
  /** When set, content is collapsed to this height (px) with a "Read more" toggle. */
  collapsedHeight?: number;
}

export function MarkdownContent({
  children,
  className,
  collapsedHeight,
}: MarkdownContentProps) {
  if (!children) return null;

  if (collapsedHeight == null) {
    return (
      <div className={cn(...proseClasses, className)}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
      </div>
    );
  }

  return (
    <CollapsibleMarkdown
      collapsedHeight={collapsedHeight}
      className={className}
    >
      {children}
    </CollapsibleMarkdown>
  );
}

function CollapsibleMarkdown({
  children,
  collapsedHeight,
  className,
}: {
  children: string;
  collapsedHeight: number;
  className?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > collapsedHeight + 8);
  }, [collapsedHeight]);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [measure, children]);

  return (
    <div>
      <div
        className="relative overflow-hidden transition-[max-height] duration-300"
        style={{ maxHeight: expanded || !overflows ? undefined : collapsedHeight }}
      >
        <div ref={contentRef} className={cn(...proseClasses, className)}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
        </div>
        {!expanded && overflows && (
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
        )}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              Read more
            </>
          )}
        </button>
      )}
    </div>
  );
}
