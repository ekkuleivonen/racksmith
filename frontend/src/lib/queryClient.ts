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
  racks: ["racks"] as const,
  groups: ["groups"] as const,
  playbooks: ["playbooks"] as const,
  codeTree: ["code", "tree"] as const,
  codeStatuses: ["code", "statuses"] as const,
};
