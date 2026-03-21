/** localStorage holds only open chat id ordering (per GitHub user + active repo). */

const PREFIX = "racksmith.ai.openChats.v1";

export function openChatsStorageKey(userId: string, repoFullName: string): string {
  return `${PREFIX}:${userId}:${repoFullName}`;
}

export function readOpenChatIds(userId: string, repoFullName: string): string[] {
  try {
    const raw = localStorage.getItem(openChatsStorageKey(userId, repoFullName));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export function writeOpenChatIds(
  userId: string,
  repoFullName: string,
  ids: string[],
): void {
  localStorage.setItem(openChatsStorageKey(userId, repoFullName), JSON.stringify(ids));
}
