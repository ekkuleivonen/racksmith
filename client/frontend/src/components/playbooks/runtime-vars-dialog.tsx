"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RoleCatalogEntry, RoleInput } from "@/lib/playbooks";

export type SecretInput = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
};

function collectSecretInputs(roles: RoleCatalogEntry[]): SecretInput[] {
  const seen = new Set<string>();
  const result: SecretInput[] = [];
  for (const role of roles) {
    for (const inp of role.inputs ?? []) {
      if ((inp as RoleInput & { secret?: boolean }).secret && !seen.has(inp.key)) {
        seen.add(inp.key);
        result.push({
          key: inp.key,
          label: inp.label,
          type: inp.type ?? "string",
          required: (inp as RoleInput & { required?: boolean }).required ?? false,
          options: (inp as RoleInput & { options?: string[] }).options ?? [],
        });
      }
    }
  }
  return result;
}

export interface RuntimeVarsDialogProps {
  open: boolean;
  roles: RoleCatalogEntry[];
  needsBecomePassword: boolean;
  onConfirm: (vars: Record<string, string>, becomePassword: string | null) => void | Promise<void>;
  onCancel: () => void;
}

export function RuntimeVarsDialog({
  open,
  roles,
  needsBecomePassword,
  onConfirm,
  onCancel,
}: RuntimeVarsDialogProps) {
  const secretInputs = collectSecretInputs(roles);
  const hasSecretInputs = secretInputs.length > 0 || needsBecomePassword;

  const [vars, setVars] = useState<Record<string, string>>({});
  const [becomePassword, setBecomePassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const requiredSecrets = secretInputs.filter((i) => i.required);
  const allRequiredFilled =
    requiredSecrets.every((i) => (vars[i.key] ?? "").trim().length > 0) &&
    (!needsBecomePassword || becomePassword.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRequiredFilled || submitting) return;
    const runtimeVars: Record<string, string> = {};
    for (const inp of secretInputs) {
      const v = (vars[inp.key] ?? "").trim();
      if (v) runtimeVars[inp.key] = v;
    }
    setSubmitting(true);
    try {
      await onConfirm(runtimeVars, needsBecomePassword ? becomePassword : null);
    } finally {
      setSubmitting(false);
    }
    setVars({});
    setBecomePassword("");
  };

  const handleCancel = () => {
    setVars({});
    setBecomePassword("");
    onCancel();
  };

  if (!hasSecretInputs) return null;

  const isBoolType = (type: string) => type === "bool" || type === "boolean";

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !submitting && handleCancel()}>
      <AlertDialogContent size="md" className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle>Runtime inputs</AlertDialogTitle>
            <AlertDialogDescription>
              These values are never stored. They are passed directly to the run and discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            {secretInputs.map((inp) => (
              <div key={inp.key} className="space-y-2">
                <Label htmlFor={inp.key}>
                  {inp.label}
                  {inp.required ? " *" : ""}
                </Label>
                {isBoolType(inp.type) ? (
                  <Select
                    value={vars[inp.key] ?? ""}
                    onValueChange={(value) =>
                      setVars((prev) => ({ ...prev, [inp.key]: value }))
                    }
                  >
                    <SelectTrigger id={inp.key} className="w-full">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">true</SelectItem>
                      <SelectItem value="false">false</SelectItem>
                    </SelectContent>
                  </Select>
                ) : inp.options.length > 0 ? (
                  <Select
                    value={vars[inp.key] ?? ""}
                    onValueChange={(value) =>
                      setVars((prev) => ({ ...prev, [inp.key]: value }))
                    }
                  >
                    <SelectTrigger id={inp.key} className="w-full">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {inp.options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={inp.key}
                    type={inp.type === "secret" ? "password" : "text"}
                    value={vars[inp.key] ?? ""}
                    onChange={(e) =>
                      setVars((prev) => ({ ...prev, [inp.key]: e.target.value }))
                    }
                    autoComplete="off"
                  />
                )}
              </div>
            ))}
            {needsBecomePassword ? (
              <div className="space-y-2">
                <Label htmlFor="become-password">
                  Sudo password *
                </Label>
                <Input
                  id="become-password"
                  type="password"
                  value={becomePassword}
                  onChange={(e) => setBecomePassword(e.target.value)}
                  autoComplete="off"
                />
              </div>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel type="button" onClick={handleCancel} disabled={submitting}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" disabled={!allRequiredFilled || submitting}>
              {submitting ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" />
                  Starting…
                </>
              ) : (
                "Run"
              )}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function needsRuntimeVarsDialog(
  roles: RoleCatalogEntry[],
  needsBecomePassword: boolean,
): boolean {
  if (needsBecomePassword) return true;
  return collectSecretInputs(roles).length > 0;
}
