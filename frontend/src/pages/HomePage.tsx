import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { HomeDashboard } from "@/components/home-dashboard";
import { useAuth } from "@/context/auth-context";
import { useSetupStore } from "@/stores/setup";
import { useHosts } from "@/hooks/queries";
import { isManagedHost } from "@/lib/hosts";

function isSetupComplete(
  loading: boolean,
  repoReady: boolean,
  nodesCount: number,
): boolean {
  return !loading && repoReady && nodesCount > 0;
}

export function HomePage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const loading = useSetupStore((s) => s.loading);
  const status = useSetupStore((s) => s.status);
  const loadSetup = useSetupStore((s) => s.load);
  const { data: hosts = [] } = useHosts();

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
    return (
      <div className="flex-1 flex items-center justify-center py-16 overflow-auto">
        <div className="max-w-2xl w-full mx-6 space-y-12">
          <div className="space-y-4 text-center">
            <h1 className="text-4xl font-bold text-zinc-100 tracking-tight">
              RACKSMITH
            </h1>
            <p className="text-lg text-zinc-400 max-w-xl mx-auto">
              Homelab infra - simplified
            </p>
          </div>

          <div className="flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/setup">Login to get started</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const managedCount = hosts.filter(isManagedHost).length;
  if (!isSetupComplete(loading, status?.repo_ready ?? false, managedCount)) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <AppShell title="Home">
      <HomeDashboard />
    </AppShell>
  );
}
