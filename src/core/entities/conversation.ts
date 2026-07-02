export const conversationSourceTypes = [
  "ChatGPT",
  "Claude",
  "DeepSeek",
  "Gemini",
  "Markdown",
  "TXT",
  "Manual",
  "Plain Text",
] as const;

export type ConversationSourceType = (typeof conversationSourceTypes)[number];

export type Conversation = {
  id: string;
  title: string;
  sourceType: ConversationSourceType;
  importProfileId?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
};
