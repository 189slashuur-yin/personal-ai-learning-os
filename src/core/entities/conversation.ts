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
  workspaceId?: string;
  order?: number;
  importProfileId?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  summary?: string;
  conclusion?: string;
  pendingQuestions?: string;
  externalSource?: "chatgpt";
  externalConversationId?: string;
  importedAt?: string;
  lastExternalUpdateTime?: string;
};
