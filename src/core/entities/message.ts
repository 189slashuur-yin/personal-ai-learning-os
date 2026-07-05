export const messageRoles = [
  "user",
  "assistant",
  "system",
  "unknown",
] as const;

export type MessageRole = (typeof messageRoles)[number];

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  externalMessageId?: string;
  contentHash?: string;
};
