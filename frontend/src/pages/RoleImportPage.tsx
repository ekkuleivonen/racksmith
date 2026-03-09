import { useState } from "react";
import { CheckCircle, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";

const LLM_PROMPT = `You are generating a Racksmith role YAML. Output a single YAML document. Do not include markdown code fences.

## Rules
- slug: lowercase, hyphens only, no spaces (e.g. install-docker, setup-node-exporter)
- name: title case, short
- One role = one concern
- Do NOT use these reserved slugs: ping, get-info, uptime, disk-usage, memory-usage, service-status, system-upgrade, reboot-if-required, ssh-authorized-key, ensure-directory, create-user, install-packages, set-hostname, mount-disk

## Schema
- slug (required): unique ID, becomes directory name
- name (required): display name
- description: freeform text
- labels: freeform category tags (e.g. [packages, system, security])
- compatibility.os_family: [] for any OS, or ["debian"], ["rhel"], etc.
- inputs: list of { key, label, type, placeholder?, default?, required?, options? (for select), interactive? (true = never stored, for secrets) }
  - type: "string" | "boolean" | "select" | "secret"
- tasks: Ansible task list (standard YAML). Becomes tasks/main.yml

## Examples

Example 1 - minimal (no inputs):
slug: ping
name: Ping
description: Verify Ansible connectivity.
labels: []
inputs: []
compatibility:
  os_family: []

Example 2 - with inputs:
slug: install-packages
name: Install Packages
description: Install or remove packages via apt/dnf/yum.
labels: [packages, system]
inputs:
- key: package_names
  label: Package names
  type: string
  placeholder: git,curl,htop
  default: ''
  required: true
- key: package_state
  label: Package state
  type: select
  options:
  - present
  - absent
  - latest
  default: present
  required: true
- key: update_cache
  label: Update package cache first
  type: boolean
  default: true
  required: false
compatibility:
  os_family:
  - debian
  - rhel
tasks:
  - name: Install packages
    ansible.builtin.apt:
      name: "{{ package_names }}"
      state: "{{ package_state }}"
      update_cache: "{{ update_cache }}"
    when: ansible_os_family == "Debian"

Example 3 - with select and boolean:
slug: create-user
name: Create User
description: Create or remove a local user, optionally with sudo.
labels: [users]
inputs:
- key: username
  label: Username
  type: string
  placeholder: deploy
  default: ''
  required: true
- key: user_state
  label: User state
  type: select
  options:
  - present
  - absent
  default: present
  required: true
- key: grant_sudo
  label: Grant sudo access
  type: boolean
  default: false
  required: false
compatibility:
  os_family: []
`;

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

type RoleResponse = {
  slug: string;
  name: string;
  description: string;
  has_tasks: boolean;
};

export function RoleImportPage() {
  const [yaml, setYaml] = useState(TEMPLATE);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RoleResponse | null>(null);
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
    setResult(null);
    setError(null);
    try {
      const data = await apiPost<{ role: RoleResponse }>("/roles/from-yaml", {
        yaml_text: yaml,
      });
      setResult(data.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="space-y-1">
          <h1 className="text-zinc-100 font-semibold">Import role</h1>
          <p className="text-xs text-zinc-500">
            Copy the prompt below into an LLM to generate role YAML. Paste the
            result in the textarea and click Create.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
              LLM prompt
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleCopyPrompt}
            >
              <Copy className="size-3.5" />
              Copy
            </Button>
          </div>
          <pre
            className="p-4 rounded border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300 font-mono overflow-x-auto select-all cursor-text"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {LLM_PROMPT}
          </pre>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Paste YAML here
          </p>
          <Textarea
            value={yaml}
            onChange={(e) => {
              setYaml(e.target.value);
              setResult(null);
              setError(null);
            }}
            className="font-mono text-xs min-h-[300px] bg-zinc-900 border-zinc-700 text-zinc-200 resize-y"
            spellCheck={false}
          />

          <div className="flex items-center gap-3">
            <Button onClick={handleSubmit} disabled={submitting || !yaml.trim()}>
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              ) : null}
              {submitting ? "Creating…" : "Create role"}
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
                Role created and pushed to GitHub
              </div>
              <p className="text-xs text-zinc-400">
                <span className="font-mono text-zinc-200">{result.slug}</span>{" "}
                — {result.name}
              </p>
              <p className="text-xs text-zinc-500">
                <span className="font-mono">.racksmith/roles/{result.slug}/</span>
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
      </div>
    </div>
  );
}
