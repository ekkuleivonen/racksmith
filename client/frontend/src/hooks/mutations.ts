import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { startScan, type DiscoveredDevice } from "@/lib/discovery";
import { invalidateResource, queryKeys } from "@/lib/queryClient";
import {
  createHost,
  deleteHost,
  refreshHost,
  relocateHost,
  updateHost,
  type HostInput,
  type RelocateResponse,
} from "@/lib/hosts";
import {
  createGroup,
  deleteGroup,
  updateGroup,
  type GroupInput,
} from "@/lib/groups";
import { createRack, deleteRack, updateRack } from "@/lib/racks";
import { rebootHost } from "@/lib/ssh";
import { createRoleFromYaml, deleteRole, updateRole } from "@/lib/roles";
import {
  pushToRegistry,
  importFromRegistry,
  deleteRegistryRole,
  pushPlaybookToRegistry,
  importPlaybookFromRegistry,
  deleteRegistryPlaybook,
} from "@/lib/registry";
import {
  createPlaybook,
  deletePlaybook,
  updatePlaybook,
  type PlaybookUpsert,
} from "@/lib/playbooks";

function useToastMutation<TVariables, TData = unknown>(
  mutationFn: (vars: TVariables) => Promise<TData>,
  options?: {
    success?: string | ((data: TData, vars: TVariables) => string);
    onSuccess?: (data: TData, vars: TVariables) => void;
  },
) {
  return useMutation({
    mutationFn,
    onSuccess: (data, vars) => {
      if (options?.success) {
        toast.success(
          typeof options.success === "function"
            ? options.success(data, vars)
            : options.success,
        );
      }
      options?.onSuccess?.(data, vars);
    },
    onError: (err) => toast.error(err.message),
  });
}

export const useCreateHost = () =>
  useToastMutation((p: HostInput) => createHost(p));

export const useUpdateHost = () =>
  useToastMutation(({ id, payload }: { id: string; payload: HostInput }) =>
    updateHost(id, payload),
  );

export const useDeleteHost = () =>
  useToastMutation((id: string) => deleteHost(id), { success: "Host deleted" });

export const useRefreshHost = () =>
  useToastMutation((id: string) => refreshHost(id), {
    success: "Host probed",
  });

export const useRelocateHost = () =>
  useToastMutation((id: string) => relocateHost(id), {
    success: (data: RelocateResponse) =>
      data.changed
        ? `IP updated: ${data.previous_ip} → ${data.new_ip}`
        : `IP unchanged (${data.new_ip})`,
    onSuccess: () => {
      invalidateResource("hosts");
    },
  });

export const useRebootHost = () =>
  useToastMutation((id: string) => rebootHost(id), {
    success: "Reboot command sent",
  });

export const useCreateGroup = () =>
  useToastMutation((payload: GroupInput) => createGroup(payload));

export const useUpdateGroup = () =>
  useToastMutation(({ id, payload }: { id: string; payload: GroupInput }) =>
    updateGroup(id, payload),
  );

export const useDeleteGroup = () =>
  useToastMutation((id: string) => deleteGroup(id), {
    success: "Group deleted",
  });

export const useCreateRack = () => useToastMutation(createRack);

export const useUpdateRack = () =>
  useToastMutation(
    ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof updateRack>[1];
    }) => updateRack(id, payload),
  );

export const useDeleteRack = () =>
  useToastMutation((id: string) => deleteRack(id), { success: "Rack deleted" });

export const useCreateRoleFromYaml = () =>
  useToastMutation((yamlText: string) => createRoleFromYaml(yamlText));

export function useUpdateRole(roleId: string) {
  const queryClient = useQueryClient();
  return useToastMutation((yamlText: string) => updateRole(roleId, yamlText), {
    success: "Role updated",
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roleDetail(roleId) });
    },
  });
}

export const useDeleteRole = () =>
  useToastMutation((roleId: string) => deleteRole(roleId), {
    success: "Role deleted",
  });

export const usePushToRegistry = () =>
  useToastMutation((roleId: string) => pushToRegistry(roleId), {
    success: "Role pushed to registry",
  });

export const useImportFromRegistry = () =>
  useToastMutation((id: string) => importFromRegistry(id), {
    success: (result) => result.message,
  });

export const useDeleteRegistryRole = () =>
  useToastMutation((id: string) => deleteRegistryRole(id), {
    success: "Role deleted from registry",
  });

export const usePushPlaybookToRegistry = () =>
  useToastMutation((playbookId: string) =>
    pushPlaybookToRegistry(playbookId),
    { success: "Playbook pushed to registry" },
  );

export const useImportPlaybookFromRegistry = () =>
  useToastMutation((id: string) => importPlaybookFromRegistry(id), {
    success: (result) => result.message,
  });

export const useDeleteRegistryPlaybook = () =>
  useToastMutation((id: string) => deleteRegistryPlaybook(id), {
    success: "Playbook deleted from registry",
  });

export const useCreatePlaybook = () =>
  useToastMutation((payload: PlaybookUpsert) => createPlaybook(payload));

export const useUpdatePlaybook = (playbookId: string) =>
  useToastMutation(
    (payload: PlaybookUpsert) => updatePlaybook(playbookId, payload),
    { success: "Playbook saved" },
  );

export const useDeletePlaybook = () =>
  useToastMutation((playbookId: string) => deletePlaybook(playbookId), {
    success: "Playbook deleted",
  });

export const useStartScan = () =>
  useToastMutation((subnet?: string) => startScan(subnet));

export function useImportDiscoveredHosts() {
  return useToastMutation(
    async ({
      devices,
      sshUser,
    }: {
      devices: DiscoveredDevice[];
      sshUser: string;
    }) => {
      const results = [];
      for (const device of devices) {
        const result = await createHost({
          ip_address: device.ip,
          ssh_user: sshUser,
          ssh_port: 22,
          managed: true,
        });
        results.push(result);
      }
      return results;
    },
    {
      success: (_data, vars) =>
        `Imported ${vars.devices.length} host${vars.devices.length === 1 ? "" : "s"}`,
      onSuccess: () => {
        invalidateResource("hosts", "racks");
      },
    },
  );
}
