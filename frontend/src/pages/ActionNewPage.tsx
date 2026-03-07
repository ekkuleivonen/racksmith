import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/api";

const TEMPLATE = `slug: my-action
name: My Action
description: What this action does.
executor: ansible
source: user
inputs:
  - key: example_var
    label: Example variable
    type: string
    placeholder: value
    default: ""
    required: false
compatibility:
  os_family: []   # empty = any OS, or e.g. [debian, rhel]
tasks:
  - name: Example task
    ansible.builtin.debug:
      msg: "Hello from {{ inventory_hostname }}"
`;

type ActionResponse = {
  slug: string;
  name: string;
  description: string;
  source: string;
  has_tasks: boolean;
};

function Field({
  name,
  type,
  required,
  desc,
  values,
}: {
  name: string;
  type: string;
  required?: boolean;
  desc: string;
  values?: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 items-start py-1.5 border-b border-zinc-800 last:border-0">
      <div className="space-y-0.5 pt-0.5">
        <code className="text-[11px] text-zinc-200 font-mono">{name}</code>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-[9px] border-zinc-700 text-zinc-500 px-1 py-0">
            {type}
          </Badge>
          {required ? (
            <Badge variant="outline" className="text-[9px] border-amber-800/60 text-amber-500 px-1 py-0">
              required
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] border-zinc-800 text-zinc-600 px-1 py-0">
              optional
            </Badge>
          )}
        </div>
      </div>
      <div className="space-y-0.5">
        <p className="text-[11px] text-zinc-400">{desc}</p>
        {values ? (
          <p className="text-[10px] text-zinc-600 font-mono">{values}</p>
        ) : null}
      </div>
    </div>
  );
}

function SchemaReference() {
  return (
    <Accordion type="multiple" defaultValue={["top", "inputs"]} className="space-y-1">
      <AccordionItem value="top" className="border border-zinc-800 px-3">
        <AccordionTrigger className="text-[11px] uppercase tracking-wide text-zinc-400 hover:text-zinc-200 py-2">
          Top-level fields
        </AccordionTrigger>
        <AccordionContent className="pb-2">
          <Field name="slug" type="string" required desc="Unique ID — becomes the directory name. Lowercase, hyphens/underscores only." />
          <Field name="name" type="string" required desc="Display name shown in the stack editor and action catalog." />
          <Field name="description" type="string" desc="Freeform description shown as tooltip/card text." />
          <Field name="executor" type="string" desc='Automation engine. Only "ansible" is supported.' values='"ansible"' />
          <Field name="source" type="string" desc="Origin marker. Always use user for your own actions." values='"builtin" | "user" | "community"' />
          <Field
            name="compatibility.os_family"
            type="list"
            desc='OS families this action targets. Leave empty for any OS.'
            values='[] or e.g. ["debian", "rhel"]'
          />
          <Field name="tasks" type="list" required desc="Ansible task list. Written to tasks/main.yml. Standard Ansible task syntax." />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="inputs" className="border border-zinc-800 px-3">
        <AccordionTrigger className="text-[11px] uppercase tracking-wide text-zinc-400 hover:text-zinc-200 py-2">
          inputs[ ] — each entry
        </AccordionTrigger>
        <AccordionContent className="pb-2">
          <Field name="key" type="string" required desc="Ansible variable name passed to the role via --extra-vars." />
          <Field name="label" type="string" required desc="Human-readable label rendered in the run form." />
          <Field
            name="type"
            type="string"
            desc="Widget type rendered in the UI."
            values='"string" | "boolean" | "select" | "secret"'
          />
          <Field name="placeholder" type="string" desc="Hint text inside the input widget." />
          <Field name="default" type="any" desc="Pre-filled value. Use null or omit to leave blank." />
          <Field name="required" type="boolean" desc="If true, the user must provide a value before the run starts." />
          <Field
            name="options"
            type="list"
            desc='Allowed values for type: select. Required when type is "select".'
            values='["stable", "test"]'
          />
          <Field
            name="interactive"
            type="boolean"
            desc="If true, value is never stored in Git or the DB. Always prompted at run-time (use for secrets, become passwords, API tokens)."
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="types" className="border border-zinc-800 px-3">
        <AccordionTrigger className="text-[11px] uppercase tracking-wide text-zinc-400 hover:text-zinc-200 py-2">
          Input types
        </AccordionTrigger>
        <AccordionContent className="pb-2 space-y-1">
          {[
            ["string", "Text input", "General purpose variable"],
            ["boolean", "Checkbox", "Passes true / false to Ansible"],
            ["select", "Dropdown", "Requires an options list"],
            ["secret", "Password input", "Value is redacted in run logs; combine with interactive: true to also skip storage"],
          ].map(([t, widget, note]) => (
            <div key={t} className="flex gap-2 items-start py-1 border-b border-zinc-800 last:border-0">
              <code className="text-[11px] font-mono text-zinc-200 w-16 shrink-0">{t}</code>
              <div>
                <p className="text-[11px] text-zinc-300">{widget}</p>
                <p className="text-[10px] text-zinc-500">{note}</p>
              </div>
            </div>
          ))}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="builtins" className="border border-zinc-800 px-3">
        <AccordionTrigger className="text-[11px] uppercase tracking-wide text-zinc-400 hover:text-zinc-200 py-2">
          Built-in actions
        </AccordionTrigger>
        <AccordionContent className="pb-2 space-y-0">
          <p className="text-[10px] text-zinc-500 mb-2">
            Synced automatically — do not create actions with these slugs.
          </p>
          {[
            ["ping", "Verify Ansible connectivity"],
            ["get-info", "Gather OS / hardware facts"],
            ["uptime", "Show system uptime"],
            ["disk-usage", "Root filesystem usage"],
            ["memory-usage", "Memory usage"],
            ["service-status", "Inspect a systemd service"],
            ["system-upgrade", "Upgrade packages (apt / dnf / yum)"],
            ["reboot-if-required", "Reboot if the OS signals it"],
          ].map(([slug, desc]) => (
            <div key={slug} className="flex gap-2 items-start py-1 border-b border-zinc-800 last:border-0">
              <code className="text-[11px] font-mono text-zinc-200 w-36 shrink-0">{slug}</code>
              <p className="text-[11px] text-zinc-500">{desc}</p>
            </div>
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function ActionNewPage() {
  const [yaml, setYaml] = useState(TEMPLATE);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);
    setError(null);
    try {
      const data = await apiPost<{ action: ActionResponse }>("/actions/from-yaml", {
        yaml_text: yaml,
      });
      setResult(data.action);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 space-y-1">
          <h1 className="text-zinc-100 font-semibold">New action</h1>
          <p className="text-xs text-zinc-500">
            Paste a single YAML document. The{" "}
            <code className="font-mono">tasks</code> key becomes{" "}
            <code className="font-mono">tasks/main.yml</code>; everything else
            is <code className="font-mono">action.yaml</code>. Saved and pushed
            to your racksmith branch automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          {/* Editor column */}
          <div className="space-y-3">
            <Textarea
              value={yaml}
              onChange={(e) => {
                setYaml(e.target.value);
                setResult(null);
                setError(null);
              }}
              className="font-mono text-xs min-h-[520px] bg-zinc-900 border-zinc-700 text-zinc-200 resize-y"
              spellCheck={false}
            />

            <div className="flex items-center gap-3">
              <Button onClick={handleSubmit} disabled={submitting || !yaml.trim()}>
                {submitting ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : null}
                {submitting ? "Creating…" : "Create action"}
              </Button>
              <Button
                variant="ghost"
                className="text-zinc-500"
                onClick={() => {
                  setYaml(TEMPLATE);
                  setResult(null);
                  setError(null);
                }}
              >
                Reset template
              </Button>
            </div>

            {result ? (
              <div className="border border-emerald-800/50 bg-emerald-950/30 p-4 space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                  <CheckCircle className="size-4" />
                  Action created and pushed to GitHub
                </div>
                <p className="text-xs text-zinc-400">
                  <span className="font-mono text-zinc-200">{result.slug}</span>{" "}
                  &mdash; {result.name}
                </p>
                <p className="text-xs text-zinc-500">
                  <span className="font-mono">.racksmith/actions/{result.slug}/</span>
                </p>
              </div>
            ) : null}

            {error ? (
              <div className="border border-red-800/50 bg-red-950/30 p-4">
                <p className="text-xs text-red-400 font-medium mb-1">Error</p>
                <pre className="text-xs text-zinc-300 whitespace-pre-wrap">{error}</pre>
              </div>
            ) : null}
          </div>

          {/* Reference column */}
          <div className="space-y-2">
            <Separator className="lg:hidden bg-zinc-800" />
            <p className="text-[11px] uppercase tracking-wide text-zinc-500 px-0.5">
              Reference
            </p>
            <SchemaReference />
          </div>
        </div>
      </div>
    </div>
  );
}
