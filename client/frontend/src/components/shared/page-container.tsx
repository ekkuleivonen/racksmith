import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  wide?: boolean;
  maxWidth?: string;
}

export function PageContainer({ children, wide, maxWidth }: PageContainerProps) {
  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className={cn("mx-auto space-y-4", maxWidth ?? (wide ? "max-w-6xl" : "max-w-4xl"))}>{children}</div>
    </div>
  );
}
