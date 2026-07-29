import type {
  ConversationContext,
  ConversationContextField,
} from "@/core/entities/conversation";

export const roundContextInheritanceModes = ["inherit", "exclude"] as const;

export type RoundContextInheritanceMode =
  (typeof roundContextInheritanceModes)[number];

export type RoundContext = {
  inheritanceMode: RoundContextInheritanceMode;
  sourceRoundId?: string;
  excludedFields?: ConversationContextField[];
  overrides?: ConversationContext;
  snapshot?: ConversationContext;
  confirmedAt?: string;
};

export type Round = {
  id: string;
  conversationId: string;
  order: number;
  title: string;
  question: string;
  answer: string;
  messageIds: string[];
  note?: string;
  summary?: string;
  context?: RoundContext;
  createdAt: string;
  updatedAt: string;
};
