import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
}

export function PageContainer({ children }: PageContainerProps) {
  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">{children}</div>
    </div>
  );
}
