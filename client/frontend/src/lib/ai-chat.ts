import { apiDelete, apiGet, apiPost, apiStreamPost } from "@/lib/api";

export type ChatUiMessageKind =
  | "user"
  | "assistant"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "system"
  | "other";

export type ChatUiMessage = {
  kind: ChatUiMessageKind;
  text: string;
  tool?: string | null;
  args?: Record<string, unknown> | null;
  result_preview?: string | null;
  outcome?: string | null;
  result_type?: string | null;
  exit_code?: number | null;
  entity_id?: string | null;
  entity_name?: string | null;
  run_status?: string | null;
};

export type ChatStreamContext = {
  hosts?: string[];
  playbooks?: string[];
  roles?: string[];
  groups?: string[];
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
