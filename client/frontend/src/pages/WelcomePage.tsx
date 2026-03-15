import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useState } from "react";

export function WelcomePage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = () => {
    setSigningIn(true);
    login();
  };

  return (
    <div className="flex-1 flex items-center justify-center py-16 overflow-auto">
      <div className="max-w-2xl w-full mx-6 space-y-12">
        <div className="space-y-4 text-center">
          <h1 className="text-4xl font-bold text-zinc-100 tracking-tight">
            RACKSMITH
          </h1>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">
            Homelab infra &mdash; simplified
          </p>
        </div>

        <div className="flex justify-center">
          <Button size="lg" onClick={handleLogin} disabled={signingIn}>
            {signingIn ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Redirecting to GitHub...
              </>
            ) : (
              "Sign in with GitHub"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
