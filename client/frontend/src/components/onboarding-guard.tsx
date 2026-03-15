import { type ReactNode, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/auth-context";
import { useSetupStore } from "@/stores/setup";

export function OnboardingGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const loading = useSetupStore((s) => s.loading);
  const status = useSetupStore((s) => s.status);
  const loadSetup = useSetupStore((s) => s.load);

  useEffect(() => {
    if (isAuthenticated) {
      void loadSetup();
    }
  }, [isAuthenticated, loadSetup]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (status && !status.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
