import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastApiError } from "@/lib/api";
import {
  getOpenAIModels,
  getSettings,
  updateSettings,
  type AppSettings,
} from "@/lib/settings";

export type { AppSettings } from "@/lib/settings";

const EMPTY_SETTINGS: AppSettings = {
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_MODEL: "",
  GIT_RACKSMITH_BRANCH: "",
  REGISTRY_URL: "",
};

export type UserConfigFormHandle = {
  save: () => Promise<void>;
};

type UserConfigFormProps = {
  onSaved?: () => void;
  showSaveButton?: boolean;
};

export const UserConfigForm = forwardRef<
  UserConfigFormHandle,
  UserConfigFormProps
>(function UserConfigForm({ onSaved, showSaveButton = true }, ref) {
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openaiModels, setOpenaiModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await getSettings();
      setSettings(data);
    } catch (error) {
      toastApiError(error, "Failed to load settings");
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  const loadOpenaiModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const models = await getOpenAIModels();
      setOpenaiModels(models);
    } catch {
      // non-critical
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings().then(() => void loadOpenaiModels());
  }, [fetchSettings, loadOpenaiModels]);

  const initialKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (loadingSettings) return;
    if (initialKeyRef.current === null) {
      initialKeyRef.current = settings.OPENAI_API_KEY;
      return;
    }
    if (settings.OPENAI_API_KEY === initialKeyRef.current) return;
    // Don't trigger on masked values coming back from the server
    if (settings.OPENAI_API_KEY.includes("•")) return;

    const timer = setTimeout(async () => {
      try {
        const next = await updateSettings({
          OPENAI_API_KEY: settings.OPENAI_API_KEY,
        });
        setSettings(next);
        await loadOpenaiModels();
      } catch {
        setOpenaiModels([]);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [settings.OPENAI_API_KEY, loadingSettings, loadOpenaiModels]);

  const updateSetting = (key: keyof AppSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = await updateSettings(settings as Record<string, string>);
      setSettings(next);
      toast.success("Settings saved");
      void loadOpenaiModels();
      onSaved?.();
    } catch (error) {
      toastApiError(error, "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  useImperativeHandle(ref, () => ({ save: handleSave }));

  return (
    <div className="space-y-4">
      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardHeader className="space-y-1">
          <CardTitle>AI Configuration</CardTitle>
          <p className="text-xs text-zinc-500">
            OpenAI credentials for AI-assisted role generation.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="openai-key" className="text-xs text-zinc-400">
              OPENAI_API_KEY
            </Label>
            <Input
              id="openai-key"
              type="password"
              placeholder={loadingSettings ? "Loading..." : "sk-..."}
              value={settings.OPENAI_API_KEY}
              onChange={(e) =>
                updateSetting("OPENAI_API_KEY", e.target.value)
              }
              disabled={loadingSettings}
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="openai-base-url"
              className="text-xs text-zinc-400"
            >
              OPENAI_BASE_URL
            </Label>
            <Input
              id="openai-base-url"
              placeholder="https://api.openai.com/v1 (default)"
              value={settings.OPENAI_BASE_URL}
              onChange={(e) =>
                updateSetting("OPENAI_BASE_URL", e.target.value)
              }
              disabled={loadingSettings}
            />
            <p className="text-[11px] text-zinc-500">
              Leave empty for OpenAI. Set to use a compatible provider (e.g.
              Ollama, Azure, Together).
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">OPENAI_MODEL</Label>
            <Select
              value={settings.OPENAI_MODEL}
              onValueChange={(v) => updateSetting("OPENAI_MODEL", v)}
              disabled={loadingSettings || openaiModels.length === 0}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue
                  placeholder={
                    loadingModels
                      ? "Loading models..."
                      : openaiModels.length === 0
                        ? "Enter a valid API key to load models"
                        : "Select model"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {settings.OPENAI_MODEL &&
                  !openaiModels.includes(settings.OPENAI_MODEL) && (
                    <SelectItem value={settings.OPENAI_MODEL}>
                      {settings.OPENAI_MODEL}
                    </SelectItem>
                  )}
                {openaiModels.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardHeader className="space-y-1">
          <CardTitle>Git &amp; Registry</CardTitle>
          <p className="text-xs text-zinc-500">
            Branch and registry configuration.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="git-branch" className="text-xs text-zinc-400">
              GIT_RACKSMITH_BRANCH
            </Label>
            <Input
              id="git-branch"
              placeholder="racksmith"
              value={settings.GIT_RACKSMITH_BRANCH}
              onChange={(e) =>
                updateSetting("GIT_RACKSMITH_BRANCH", e.target.value)
              }
              disabled={loadingSettings}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="registry-url" className="text-xs text-zinc-400">
              REGISTRY_URL
            </Label>
            <Input
              id="registry-url"
              placeholder="https://registry.racksmith.io"
              value={settings.REGISTRY_URL}
              onChange={(e) => updateSetting("REGISTRY_URL", e.target.value)}
              disabled={loadingSettings}
            />
          </div>
        </CardContent>
      </Card>

      {showSaveButton && (
        <div className="flex justify-end">
          <Button
            onClick={() => void handleSave()}
            disabled={saving || loadingSettings}
          >
            {saving ? "Saving..." : "Save settings"}
          </Button>
        </div>
      )}
    </div>
  );
});
