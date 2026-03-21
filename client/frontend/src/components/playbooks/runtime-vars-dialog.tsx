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
import type { RequiredRuntimeVarEntry } from "@/lib/playbooks";

export type RuntimeVarField = RequiredRuntimeVarEntry;

export interface RuntimeVarsDialogProps {
  open: boolean;
  fields: RuntimeVarField[];
  needsBecomePassword: boolean;
  onConfirm: (vars: Record<string, string>, becomePassword: string | null) => void | Promise<void>;
  onCancel: () => void;
}

export function RuntimeVarsDialog({
  open,
  fields,
  needsBecomePassword,
  onConfirm,
  onCancel,
}: RuntimeVarsDialogProps) {
  const hasSecretInputs = fields.some((f) => f.secret);
  const hasPlainRequired = fields.some((f) => !f.secret);
  const hasAnyInputs = hasSecretInputs || hasPlainRequired || needsBecomePassword;

  const [vars, setVars] = useState<Record<string, string>>({});
  const [becomePassword, setBecomePassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const requiredFields = fields.filter((f) => f.required);
  const allRequiredFilled =
    requiredFields.every((i) => (vars[i.key] ?? "").trim().length > 0) &&
    (!needsBecomePassword || becomePassword.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRequiredFilled || submitting) return;
    const runtimeVars: Record<string, string> = {};
    for (const inp of fields) {
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

  if (!hasAnyInputs) return null;

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
            {fields.map((inp) => (
              <div key={inp.key} className="space-y-2">
                <Label htmlFor={inp.key}>
                  {inp.label}
                  {inp.required ? " *" : ""}
                  {!inp.secret ? (
                    <span className="ml-1 text-[10px] font-normal text-zinc-500">
                      ({inp.role_name})
                    </span>
                  ) : null}
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
                      {inp.options.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={inp.key}
                    type={inp.secret ? "password" : "text"}
                    autoComplete="off"
                    value={vars[inp.key] ?? ""}
                    onChange={(e) =>
                      setVars((prev) => ({ ...prev, [inp.key]: e.target.value }))
                    }
                    placeholder={inp.secret ? "••••••••" : ""}
                  />
                )}
              </div>
            ))}

            {needsBecomePassword ? (
              <div className="space-y-2">
                <Label htmlFor="become-password">Sudo password *</Label>
                <Input
                  id="become-password"
                  type="password"
                  autoComplete="off"
                  value={becomePassword}
                  onChange={(e) => setBecomePassword(e.target.value)}
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
  fields: RuntimeVarField[],
  needsBecomePassword: boolean,
): boolean {
  return fields.length > 0 || needsBecomePassword;
}
