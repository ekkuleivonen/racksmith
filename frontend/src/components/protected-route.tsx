import { type ReactNode, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/auth-context";
import { useSetupStore } from "@/stores/setup";
import { useNodesStore } from "@/stores/nodes";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const loading = useSetupStore((s) => s.loading);
  const status = useSetupStore((s) => s.status);
  const loadSetup = useSetupStore((s) => s.load);
  const loadNodes = useNodesStore((s) => s.load);
  const nodes = useNodesStore((s) => s.nodes);

  useEffect(() => {
    if (isAuthenticated) {
      void loadSetup();
      void loadNodes();
    }
  }, [isAuthenticated, loadSetup, loadNodes]);

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/setup" replace />;
  }

  if (loading || !status?.repo_ready || nodes.length === 0) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}
