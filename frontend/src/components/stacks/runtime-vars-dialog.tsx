"use client";

import { useState } from "react";
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
import type { Action, ActionInput } from "@/lib/stacks";

export type InteractiveInput = {
  key: string;
  label: string;
  type: string;
  required: boolean;
};

function collectInteractiveInputs(actions: Action[]): InteractiveInput[] {
  const seen = new Set<string>();
  const result: InteractiveInput[] = [];
  for (const action of actions) {
    for (const inp of action.inputs ?? []) {
      if ((inp as ActionInput & { interactive?: boolean }).interactive && !seen.has(inp.key)) {
        seen.add(inp.key);
        result.push({
          key: inp.key,
          label: inp.label,
          type: inp.type ?? "string",
          required: (inp as ActionInput & { required?: boolean }).required ?? false,
        });
      }
    }
  }
  return result;
}

export interface RuntimeVarsDialogProps {
  open: boolean;
  actions: Action[];
  needsBecomePassword: boolean;
  onConfirm: (vars: Record<string, string>, becomePassword: string | null) => void;
  onCancel: () => void;
}

export function RuntimeVarsDialog({
  open,
  actions,
  needsBecomePassword,
  onConfirm,
  onCancel,
}: RuntimeVarsDialogProps) {
  const interactiveInputs = collectInteractiveInputs(actions);
  const hasInteractiveInputs = interactiveInputs.length > 0 || needsBecomePassword;

  const [vars, setVars] = useState<Record<string, string>>({});
  const [becomePassword, setBecomePassword] = useState("");

  const requiredInteractive = interactiveInputs.filter((i) => i.required);
  const allRequiredFilled =
    requiredInteractive.every((i) => (vars[i.key] ?? "").trim().length > 0) &&
    (!needsBecomePassword || becomePassword.trim().length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRequiredFilled) return;
    const runtimeVars: Record<string, string> = {};
    for (const inp of interactiveInputs) {
      const v = (vars[inp.key] ?? "").trim();
      if (v) runtimeVars[inp.key] = v;
    }
    onConfirm(runtimeVars, needsBecomePassword ? becomePassword : null);
    setVars({});
    setBecomePassword("");
  };

  const handleCancel = () => {
    setVars({});
    setBecomePassword("");
    onCancel();
  };

  if (!hasInteractiveInputs) return null;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <AlertDialogContent size="md" className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle>Runtime inputs</AlertDialogTitle>
            <AlertDialogDescription>
              These values are never stored. They are passed directly to the run and discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            {interactiveInputs.map((inp) => (
              <div key={inp.key} className="space-y-2">
                <Label htmlFor={inp.key}>
                  {inp.label}
                  {inp.required ? " *" : ""}
                </Label>
                <Input
                  id={inp.key}
                  type={inp.type === "secret" ? "password" : "text"}
                  value={vars[inp.key] ?? ""}
                  onChange={(e) => setVars((prev) => ({ ...prev, [inp.key]: e.target.value }))}
                  autoComplete="off"
                />
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
            <AlertDialogCancel type="button" onClick={handleCancel}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" disabled={!allRequiredFilled}>
              Run
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function needsRuntimeVarsDialog(
  actions: Action[],
  needsBecomePassword: boolean,
): boolean {
  if (needsBecomePassword) return true;
  return collectInteractiveInputs(actions).length > 0;
}
