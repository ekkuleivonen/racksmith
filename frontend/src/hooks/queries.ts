import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { listNodes } from "@/lib/nodes";
import { listRacks, getRackLayout } from "@/lib/racks";
import { listGroups } from "@/lib/groups";
import { listStacks } from "@/lib/stacks";
import { apiGet } from "@/lib/api";
import type { Node } from "@/lib/nodes";
import type { RackSummary } from "@/lib/racks";
import type { Group } from "@/lib/groups";
import type { TreeEntry } from "@/components/code/file-tree";

export type RackNavEntry = {
  rack: RackSummary;
  nodes: Node[];
};

export function useNodes() {
  return useQuery({
    queryKey: queryKeys.nodes,
    queryFn: () => listNodes().catch(() => [] as Node[]),
  });
}

export function useRackEntries() {
  return useQuery({
    queryKey: queryKeys.racks,
    queryFn: async () => {
      const racks = await listRacks().catch(() => [] as RackSummary[]);
      const entries: RackNavEntry[] = await Promise.all(
        racks.map(async (rack) => {
          const { layout } = await getRackLayout(rack.slug);
          return { rack, nodes: layout.nodes.filter((n) => n.managed) };
        }),
      );
      return entries;
    },
  });
}

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => listGroups().catch(() => [] as Group[]),
  });
}

export function useStacks() {
  return useQuery({
    queryKey: queryKeys.stacks,
    queryFn: async () => {
      const result = await listStacks().catch(() => ({
        stacks: [],
        actions: [],
      }));
      return result.stacks;
    },
  });
}

export function useCodeTree() {
  return useQuery({
    queryKey: queryKeys.codeTree,
    queryFn: async () => {
      const data = await apiGet<{ entries: TreeEntry[] }>("/code/tree");
      return data.entries;
    },
  });
}

type GitStatuses = {
  modifiedPaths: Record<string, true>;
  untrackedPaths: Record<string, true>;
};

export function useGitStatuses() {
  return useQuery({
    queryKey: queryKeys.codeStatuses,
    queryFn: async (): Promise<GitStatuses> => {
      const data = await apiGet<{
        modified_paths: string[];
        untracked_paths: string[];
      }>("/code/file-statuses");
      return {
        modifiedPaths: Object.fromEntries(
          data.modified_paths.map((p) => [p, true as const]),
        ),
        untrackedPaths: Object.fromEntries(
          data.untracked_paths.map((p) => [p, true as const]),
        ),
      };
    },
  });
}
