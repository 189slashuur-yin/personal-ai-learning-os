import type { MessageRole } from "@/core/entities/message";

export const conversationParserIds = [
  "chatgpt",
  "claude",
  "gemini",
  "deepseek",
  "markdown",
  "txt",
  "manual",
] as const;

export type ConversationParserId = (typeof conversationParserIds)[number];
export type ImportChannel = "clipboard" | "file" | "manual";

export type ImportArtifact = {
  name: string;
  channel: ImportChannel;
  content: string;
  mediaType?: string;
};

export type ParsedMessageDraft = {
  role: MessageRole;
  content: string;
};

export type ParsedRoundDraft = {
  order: number;
  title: string;
  question: string;
  answer: string;
  messageIndexes: number[];
};

export type ParseResult = {
  parserId: ConversationParserId;
  parserVersion: string;
  producer?: string;
  format: "provider-transcript" | "markdown" | "txt" | "manual";
  suggestedTitle: string;
  messages: ParsedMessageDraft[];
  rounds: ParsedRoundDraft[];
  warnings: string[];
  errors: string[];
};

export type ImportPreview = ParseResult & {
  artifact: ImportArtifact;
  messageCount: number;
  roundCount: number;
  unknownMessageCount: number;
  canConfirm: boolean;
};
