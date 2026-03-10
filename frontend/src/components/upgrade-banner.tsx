import { useEffect } from "react";
import { useVersionStore, initVersionCheck } from "@/stores/version";
import { Button } from "@/components/ui/button";

export function UpgradeBanner() {
  const { showBanner, dismissed, backendVersion, dismiss } = useVersionStore();

  useEffect(() => {
    return initVersionCheck();
  }, []);

  if (!showBanner || dismissed) return null;

  return (
    <div className="flex items-center justify-center gap-2 py-1.5 px-3 bg-amber-500/20 border-b border-amber-500/30 text-amber-200 text-sm">
      <span>
        A new version of Racksmith is available ({backendVersion}). Please update
        your frontend.
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-amber-200 hover:bg-amber-500/20"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ×
      </Button>
    </div>
  );
}
