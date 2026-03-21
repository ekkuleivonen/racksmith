import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/shared/page-container";
import { YamlFileView } from "@/components/files/yaml-file-view";
import { useCreateRoleFromYaml } from "@/hooks/mutations";

const EXAMPLE_YAML = `\
name: my-role
tasks:
  - name: Install packages
    ansible.builtin.apt:
      name:
        - nginx
      state: present
      update_cache: true

  - name: Start service
    ansible.builtin.systemd:
      name: nginx
      state: started
      enabled: true
`;

export function RoleCreatePage() {
  const navigate = useNavigate();

  const [yaml, setYaml] = useState(EXAMPLE_YAML);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateRoleFromYaml();

  function handleSubmit() {
    setSubmitError(null);
    createMutation.mutate(yaml, {
      onSuccess: ({ role }) => {
        toast.success(`Role "${role.name}" created`);
        navigate("/roles");
      },
      onError: (err) => setSubmitError(err.message),
    });
  }

  return (
    <PageContainer>
      <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-1">
        <h1 className="text-zinc-100 font-semibold">Create Role</h1>
        <p className="text-xs text-zinc-500">
          Define a new Ansible role in YAML. Use the AI button in the sidebar if you want help drafting or editing roles.
        </p>
      </section>

      <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
        <YamlFileView value={yaml} onChange={setYaml} height="400px" />

        {submitError && (
          <div className="rounded border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-400">
            {submitError}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !yaml.trim()}
          >
            {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Create role
          </Button>
        </div>
      </section>
    </PageContainer>
  );
}
