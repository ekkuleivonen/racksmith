import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export const queryKeys = {
  hosts: ["hosts"] as const,
  defaults: ["defaults"] as const,
  racks: ["racks"] as const,
  groups: ["groups"] as const,
  playbooks: ["playbooks"] as const,
  roles: ["roles"] as const,
  roleDetail: (id: string) => ["roles", "detail", id] as const,
  registry: ["registry"] as const,
  filesTree: ["files", "tree"] as const,
  filesStatuses: ["files", "statuses"] as const,
  discovery: ["discovery"] as const,
  subnets: ["subnets"] as const,
  ping: (hostId: string) => ["ping", hostId] as const,
};

type StaticQueryKey = {
  [K in keyof typeof queryKeys]: (typeof queryKeys)[K] extends readonly unknown[] ? K : never;
}[keyof typeof queryKeys];

export function invalidateResource(...keys: StaticQueryKey[]) {
  for (const k of keys) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys[k] as readonly unknown[],
    });
  }
}

/** Backend AI tool names from `_utils/ai.py` — keep in sync with lib/roles.ts / lib/playbooks.ts invalidation. */
export function invalidateQueriesForRacksmithAgentTool(tool: string) {
  switch (tool) {
    case "create_role":
    case "update_role":
      invalidateResource("roles", "playbooks", "filesStatuses", "filesTree");
      break;
    case "create_playbook":
    case "update_playbook":
      invalidateResource("playbooks", "roles", "filesStatuses", "filesTree");
      break;
    default:
      break;
  }
}
