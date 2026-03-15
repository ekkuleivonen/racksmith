import { apiGet, apiPost } from "@/lib/api";

export type DiffFile = {
  path: string;
  status: "modified" | "untracked" | "deleted";
  diff: string;
};

export async function getDiffs(): Promise<{ files: DiffFile[] }> {
  return apiGet<{ files: DiffFile[] }>("/files/diffs");
}

export async function commitAndPush(
  message: string,
): Promise<{ status: string; pr_url?: string | null }> {
  return apiPost<{ status: string; pr_url?: string | null }>("/files/commit", {
    message,
  });
}

export async function discardChanges(): Promise<void> {
  await apiPost("/files/discard", {});
}
