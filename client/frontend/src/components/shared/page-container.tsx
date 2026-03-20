import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  wide?: boolean;
}

export function PageContainer({ children, wide }: PageContainerProps) {
  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className={cn("mx-auto space-y-4", wide ? "max-w-6xl" : "max-w-4xl")}>{children}</div>
    </div>
  );
}
