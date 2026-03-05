import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";

export function HomePage() {
  const { user, isLoading, isAuthenticated, login } = useAuth();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center py-12 overflow-hidden relative">
      <div className="max-w-2xl w-full mx-4 space-y-12 relative z-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-zinc-100 text-center">
            RACKSMITH
          </h1>
          <p className="text-sm text-zinc-500 text-center max-w-md mx-auto">
            Manager and monitor your homelab via gitops.
          </p>
        </div>

        <div className="flex flex-col items-center gap-6">
          {isAuthenticated ? (
            <>
              <p className="text-zinc-400 text-sm">Signed in as {user?.login}</p>
              <Link to="/racks">
                <Button>Open racks</Button>
              </Link>
            </>
          ) : (
            <Button onClick={login}>Login with GitHub</Button>
          )}
        </div>
      </div>
    </div>
  );
}
