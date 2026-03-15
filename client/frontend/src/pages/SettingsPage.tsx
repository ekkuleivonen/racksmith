import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Trash2, TriangleAlert } from "lucide-react";
import { apiPost, toastApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserConfigForm } from "@/components/onboarding/user-config-form";
import { RepoStep } from "@/components/onboarding/repo-step";
import { useAuth } from "@/context/auth-context";
import { factoryReset } from "@/lib/setup";
import { PageContainer } from "@/components/shared/page-container";

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/welcome");
  };

  const handleFactoryReset = async () => {
    setResetting(true);
    try {
      await factoryReset();
      logout();
      window.location.href = "/welcome";
    } catch (error) {
      toastApiError(error, "Factory reset failed");
    } finally {
      setResetting(false);
      setResetOpen(false);
    }
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-zinc-100 text-xl font-semibold">Settings</h1>
          <p className="text-sm text-zinc-500">
            Manage your repos and configure Racksmith.
          </p>
        </div>

        {/* Account */}
        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="size-10 rounded-full shrink-0"
                  />
                ) : (
                  <div className="size-10 rounded-full bg-zinc-700 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">
                    {user?.name ?? user?.login}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {user?.login}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="size-3.5 mr-1.5" />
                Log out
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Repository */}
        <RepoStep showLocalClones={true} showActivate={true} />

        {/* AI + Git config + Save */}
        <UserConfigForm />

        {/* Clear cache & Factory reset */}
        <div className="pt-4 border-t border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              Clear all cached data (registry, run state, SSH history). Your
              session stays active.
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={clearingCache}
              onClick={async () => {
                setClearingCache(true);
                try {
                  const res = await apiPost<{ deleted_keys: number }>(
                    "/settings/clear-cache",
                  );
                  toast.success(`Cache cleared (${res.deleted_keys} keys)`);
                } catch (error) {
                  toastApiError(error, "Failed to clear cache");
                } finally {
                  setClearingCache(false);
                }
              }}
            >
              <Trash2 className="size-3.5 mr-1.5" />
              {clearingCache ? "Clearing..." : "Clear cache"}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              Wipe all settings, delete local repos, and restart onboarding.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 hover:bg-red-950/40"
              onClick={() => setResetOpen(true)}
            >
              <TriangleAlert className="size-3.5 mr-1.5" />
              Factory reset
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Factory reset</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all local repo clones, wipe your
              settings (API keys, branch config), and restart the onboarding
              wizard. Your GitHub repos are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={resetting}
              onClick={(e) => {
                e.preventDefault();
                void handleFactoryReset();
              }}
            >
              {resetting ? "Resetting..." : "Reset everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
