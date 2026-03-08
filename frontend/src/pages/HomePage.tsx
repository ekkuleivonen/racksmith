import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { HomeDashboard } from "@/components/home-dashboard";
import { useAuth } from "@/context/auth-context";
import { useSetupStore } from "@/stores/setup";
import { useNodes } from "@/hooks/queries";
import { isManagedNode } from "@/lib/nodes";

function isSetupComplete(
  loading: boolean,
  repoReady: boolean,
  nodesCount: number
): boolean {
  return !loading && repoReady && nodesCount > 0;
}

export function HomePage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
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
    return (
      <div className="flex-1 flex items-center justify-center py-16 overflow-auto">
        <div className="max-w-2xl w-full mx-6 space-y-12">
          <div className="space-y-4 text-center">
            <h1 className="text-4xl font-bold text-zinc-100 tracking-tight">
              RACKSMITH
            </h1>
            <p className="text-lg text-zinc-400 max-w-xl mx-auto">
              Infrastructure as code, backed by Git. Define your hardware, run
              Ansible stacks, and manage nodes from a single GitOps repo.
            </p>
          </div>

          <div className="space-y-6 text-zinc-500 text-sm max-w-lg mx-auto">
            <div className="space-y-2">
              <h2 className="text-zinc-300 font-medium">What it does</h2>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>
                  Rack builder — define servers, network gear, and topology in
                  YAML
                </li>
                <li>SSH terminal — connect to nodes with one click</li>
                <li>
                  Code workspace — edit stacks and inventory in the browser
                </li>
                <li>Ansible integration — run stacks and track runs</li>
              </ul>
            </div>
            <p>
              Racksmith plugs into any Git repo. Connect your GitHub account,
              pick a repo, and start defining your infra. Everything lives in
              version control.
            </p>
          </div>

          <div className="flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/setup">Get started</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const managedCount = nodes.filter(isManagedNode).length;
  if (!isSetupComplete(loading, status?.repo_ready ?? false, managedCount)) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <AppShell title="Home">
      <HomeDashboard />
    </AppShell>
  );
}
