import type { TreeEntry } from "@/components/files/file-tree";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";

export async function getCodeTree(): Promise<TreeEntry[]> {
  const data = await apiGet<{ entries: TreeEntry[] }>("/files/tree");
  return data.entries;
}

export type GitPathFlags = Record<string, true>;

export type GitStatusNormalized = {
  modified_paths: GitPathFlags;
  untracked_paths: GitPathFlags;
};

export async function getGitStatus(): Promise<GitStatusNormalized> {
  const data = await apiGet<{
    modified_paths: string[];
    untracked_paths: string[];
  }>("/git/status");
  return {
    modified_paths: Object.fromEntries(
      data.modified_paths.map((p) => [p, true as const]),
    ),
    untracked_paths: Object.fromEntries(
      data.untracked_paths.map((p) => [p, true as const]),
    ),
  };
}

export async function getFileContent(path: string): Promise<string> {
  const data = await apiGet<{ content: string }>(
    `/files/file?path=${encodeURIComponent(path)}`,
  );
  return data.content;
}

export async function updateFile(path: string, content: string): Promise<void> {
  await apiPut<{ status: string }>("/files/file", { path, content });
}

export async function createFile(path: string, content: string): Promise<void> {
  await apiPost("/files/file", { path, content });
}

export async function deleteFile(path: string): Promise<void> {
  await apiDelete(`/files/file?path=${encodeURIComponent(path)}`);
}

export async function createFolder(path: string): Promise<void> {
  await apiPost("/files/folder", { path });
}

export async function deleteFolder(path: string): Promise<void> {
  await apiDelete(`/files/folder?path=${encodeURIComponent(path)}`);
}

export async function moveEntry(src: string, dest: string): Promise<void> {
  await apiPatch("/files/move", { src, dest });
}
