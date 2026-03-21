import { apiDelete, apiGet, apiPost, apiStreamPost } from "@/lib/api";

export type ChatUiMessage = { kind: string; text: string };

export type ChatStreamContext = {
  hosts?: string[];
  playbooks?: string[];
  roles?: string[];
  runs?: string[];
  racks?: string[];
};

export async function createAiChat(): Promise<{ chat_id: string }> {
  return apiPost("/ai/chats");
}

export async function getAiChatMessages(
  chatId: string,
): Promise<{ items: ChatUiMessage[] }> {
  return apiGet(`/ai/chats/${chatId}/messages`);
}

export async function deleteAiChat(chatId: string): Promise<void> {
  await apiDelete(`/ai/chats/${chatId}`);
}

export function streamAiChatTurn(
  chatId: string,
  body: { content: string; context: ChatStreamContext },
  signal?: AbortSignal,
): Promise<Response> {
  return apiStreamPost(`/ai/chats/${chatId}/stream`, body, signal);
}
