import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { queryKeys } from "@/lib/queryClient";
import { createRoleFromYaml } from "@/lib/roles";

const LLM_PROMPT = `You are generating a Racksmith role YAML. Output a single YAML document with no markdown fences.

Required top-level keys:
  slug        – lowercase alphanumeric + hyphens (e.g. install-nginx)
  name        – human-readable name
  description – short summary

Optional top-level keys:
  labels        – list of tags (e.g. [web, nginx])
  compatibility – mapping with os_family list (e.g. {os_family: [debian, redhat]})
  inputs        – list of variable definitions (see below)
  tasks         – list of Ansible tasks (written to tasks/main.yml)

Each input item has: key, label, type (string|boolean|select|secret), placeholder, default, required, options (for select type), interactive (for runtime prompts).

Example:
slug: install-nginx
name: Install Nginx
description: Install and configure Nginx web server
labels: [web, nginx]
compatibility:
  os_family: [debian, redhat]
inputs:
  - key: nginx_port
    label: Port
    type: string
    placeholder: "80"
    default: "80"
    required: true
tasks:
  - name: Install nginx
    ansible.builtin.package:
      name: nginx
      state: present
  - name: Start nginx
    ansible.builtin.service:
      name: nginx
      state: started
      enabled: true`;

const TEMPLATE = `slug: my-role
name: My Role
description: What this role does.
labels: []
inputs:
  - key: example_var
    label: Example variable
    type: string
    placeholder: value
    default: ""
    required: false
compatibility:
  os_family: []
tasks:
  - name: Example task
    ansible.builtin.debug:
      msg: "Hello from {{ inventory_hostname }}"
`;

export function RoleCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [yaml, setYaml] = useState(TEMPLATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(LLM_PROMPT);
      toast.success("Prompt copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const { role } = await createRoleFromYaml(yaml);
      queryClient.invalidateQueries({ queryKey: queryKeys.playbooks });
      toast.success(`Role "${role.name}" created`);
      navigate("/roles");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-1">
          <h1 className="text-zinc-100 font-semibold">Create Role</h1>
          <p className="text-xs text-zinc-500">
            Define a new Ansible role using YAML. The role will be saved to
            your repository and can be pushed to the community registry.
          </p>
        </section>

        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-200">
              LLM assistant
            </h2>
            <Button variant="outline" size="sm" onClick={handleCopyPrompt}>
              <Copy className="size-3.5" />
              Copy prompt
            </Button>
          </div>
          <p className="text-xs text-zinc-500">
            Copy the prompt above and paste it into your LLM of choice along
            with a description of what the role should do. Paste the generated
            YAML below.
          </p>
        </section>

        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <h2 className="text-sm font-medium text-zinc-200">Role YAML</h2>
          <Textarea
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            rows={20}
            className="font-mono text-xs bg-zinc-950/60"
            placeholder="Paste your role YAML here..."
          />
          {error && (
            <div className="rounded border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-400">
              {error}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting || !yaml.trim()}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Create role
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
