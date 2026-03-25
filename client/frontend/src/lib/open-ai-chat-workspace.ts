import {
  readOpenChatIds,
  writeOpenChatIds,
} from "@/lib/ai-chat-storage";
import { createAiChat } from "@/lib/ai-chat";
import { toastApiError } from "@/lib/api";
import { useBottomBarStore, type BottomTab } from "@/stores/bottom-bar";

/**
 * Ensures at least one AI chat exists in localStorage, merges tabs into the bottom bar,
 * and focuses the first chat tab.
 */
export async function openAiChatWorkspace(
  userId: string,
  repoFull: string,
): Promise<void> {
  let ids = readOpenChatIds(userId, repoFull);
  if (ids.length === 0) {
    try {
      const { chat_id } = await createAiChat();
      ids = [chat_id];
      writeOpenChatIds(userId, repoFull, ids);
    } catch (e) {
      toastApiError(e, "Could not start chat");
      return;
    }
  }

  const s = useBottomBarStore.getState();
  const nonAi = s.tabs.filter((t) => t.kind !== "ai-chat");
  const aiByChat = new Map(
    s.tabs
      .filter((t): t is Extract<BottomTab, { kind: "ai-chat" }> => t.kind === "ai-chat")
      .map((t) => [t.chatId, t] as const),
  );
  const orderedAi: BottomTab[] = [];
  for (const cid of ids) {
    const existing = aiByChat.get(cid);
    if (existing) {
      orderedAi.push(existing);
    } else {
      orderedAi.push({
        kind: "ai-chat",
        id: crypto.randomUUID(),
        chatId: cid,
        label: `${cid.slice(0, 8)}…`,
      });
    }
  }
  const tabs = [...nonAi, ...orderedAi];
  useBottomBarStore.setState({
    tabs,
    activeTabId: orderedAi[0]?.id ?? tabs[0]?.id ?? null,
    panelOpen: true,
  });
}
