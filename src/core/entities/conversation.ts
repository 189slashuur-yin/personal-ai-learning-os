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

export const conversationContextFields = [
  "longTermBackground",
  "currentState",
  "decisions",
  "constraints",
  "nextActions",
] as const;

export type ConversationContextField =
  (typeof conversationContextFields)[number];

export type ConversationContext = Partial<
  Record<ConversationContextField, string>
>;

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
  context?: ConversationContext;
  externalSource?: "chatgpt";
  externalConversationId?: string;
  importedAt?: string;
  lastExternalUpdateTime?: string;
};
