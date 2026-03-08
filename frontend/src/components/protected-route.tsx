import { type ReactNode, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/auth-context";
import { useSetupStore } from "@/stores/setup";
import { useNodes } from "@/hooks/queries";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const loading = useSetupStore((s) => s.loading);
  const status = useSetupStore((s) => s.status);
  const loadSetup = useSetupStore((s) => s.load);
  const { data: nodes = [] } = useNodes();

  useEffect(() => {
    if (isAuthenticated) {
      void loadSetup();
    }
  }, [isAuthenticated, loadSetup]);

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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (!status?.repo_ready || nodes.length === 0) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}
