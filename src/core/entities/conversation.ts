export const conversationSourceTypes = [
  "ChatGPT",
  "Claude",
  "DeepSeek",
  "Markdown",
  "TXT",
  "Manual",
] as const;

export type ConversationSourceType = (typeof conversationSourceTypes)[number];

export type Conversation = {
  id: string;
  title: string;
  sourceType: ConversationSourceType;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
};
