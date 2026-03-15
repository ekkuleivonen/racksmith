import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  UserConfigForm,
  type UserConfigFormHandle,
} from "@/components/onboarding/user-config-form";
import { RepoStep } from "@/components/onboarding/repo-step";
import { HostsStep } from "@/components/onboarding/hosts-step";
import { PageContainer } from "@/components/shared/page-container";
import { RackOnboardingPage } from "@/pages/RackOnboardingPage";
import { useAuth } from "@/context/auth-context";
import { useSetupStore } from "@/stores/setup";
import { useHosts } from "@/hooks/queries";
import { isManagedHost } from "@/lib/hosts";
import { completeOnboarding } from "@/lib/setup";

type Step = 1 | 2 | 3 | 4;

function progressForStep(step: Step): number {
  switch (step) {
    case 1:
      return 25;
    case 2:
      return 50;
    case 3:
      return 75;
    case 4:
      return 90;
  }
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const loading = useSetupStore((s) => s.loading);
  const status = useSetupStore((s) => s.status);
  const loadSetup = useSetupStore((s) => s.load);
  const { data: hosts = [] } = useHosts();
  const managedCount = hosts.filter(isManagedHost).length;

  const configFormRef = useRef<UserConfigFormHandle>(null);
  const [step, setStep] = useState<Step>(1);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      void loadSetup();
    }
  }, [isAuthenticated, loadSetup]);

  if (authLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (status?.onboarding_completed) {
    return <Navigate to="/" replace />;
  }

  const finishOnboarding = async (redirectTo: string) => {
    setCompleting(true);
    try {
      await completeOnboarding();
      await loadSetup();
      navigate(redirectTo, { replace: true });
    } catch (error) {
      toastApiError(error, "Failed to complete onboarding");
    } finally {
      setCompleting(false);
    }
  };

  const handleRepoReady = () => {
    const current = useSetupStore.getState().status;
    if (current?.has_racksmith_data) {
      toast.success("Existing Racksmith data detected — skipping setup");
      void finishOnboarding("/");
    } else {
      setStep(3);
    }
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="space-y-2">
          <Progress value={progressForStep(step)} className="h-1.5" />
          <p className="text-xs text-zinc-500">Step {step} of 4</p>
        </div>

        {step === 1 && (
          <>
            <div className="space-y-1">
              <h1 className="text-zinc-100 text-xl font-semibold">
                Configure Racksmith
              </h1>
              <p className="text-sm text-zinc-500">
                Set up AI credentials and branch configuration. You can change
                these later in Settings.
              </p>
            </div>

            <UserConfigForm ref={configFormRef} showSaveButton={false} />

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                Skip for now
              </Button>
              <Button
                onClick={async () => {
                  await configFormRef.current?.save();
                  setStep(2);
                }}
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-1">
              <h1 className="text-zinc-100 text-xl font-semibold">
                Pick a repository
              </h1>
              <p className="text-sm text-zinc-500">
                Choose or create a Git repo. Everything lives in version
                control.
              </p>
            </div>

            <RepoStep onRepoReady={handleRepoReady} showLocalClones={true} />

            {status?.repo_ready && (
              <div className="flex justify-end">
                <Button onClick={() => setStep(3)}>Continue</Button>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <div className="space-y-1">
              <h1 className="text-zinc-100 text-xl font-semibold">
                Add your hosts
              </h1>
              <p className="text-sm text-zinc-500">
                Add at least one machine you can SSH into. You can add more
                later.
              </p>
            </div>

            <HostsStep />

            {managedCount > 0 && (
              <div className="flex justify-end">
                <Button onClick={() => setStep(4)}>Continue</Button>
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <div className="space-y-1">
              <h1 className="text-zinc-100 text-xl font-semibold">
                Create a rack
              </h1>
              <p className="text-sm text-zinc-500">
                Visualize your hosts on a rack. You can skip this and do it
                later.
              </p>
            </div>

            <RackOnboardingPage
              onCreated={(rackId) => {
                void finishOnboarding(`/racks/view/${rackId}`);
              }}
            />

            <div className="flex justify-end">
              <Button
                variant="outline"
                disabled={completing}
                onClick={() => void finishOnboarding("/")}
              >
                {completing ? "Finishing..." : "Skip for now"}
              </Button>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
