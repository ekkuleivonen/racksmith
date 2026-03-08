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
  nodes: ["nodes"] as const,
  racks: ["racks"] as const,
  groups: ["groups"] as const,
  stacks: ["stacks"] as const,
  codeTree: ["code", "tree"] as const,
  codeStatuses: ["code", "statuses"] as const,
};
