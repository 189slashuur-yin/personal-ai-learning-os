import type { Conversation } from "@/core/entities/conversation";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Message } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";
import type { Round } from "@/core/entities/round";

export type ConversationTranscriptMutationBatch = Readonly<{
  conversations?: readonly Readonly<Conversation>[];
  sources?: readonly Readonly<ImportedSource>[];
  messages?: readonly Readonly<Message>[];
  rounds?: readonly Readonly<Round>[];
  proposals?: readonly Readonly<Proposal>[];
  knowledgeCards?: readonly Readonly<KnowledgeCard>[];
  conversationVersions?: readonly Readonly<ConversationVersion>[];
}>;

export type ConversationTranscriptMessageReplacement = Readonly<{
  conversationId: string;
  messages: readonly Readonly<Message>[];
}>;

export type ConversationTranscriptRoundReplacement = Readonly<{
  conversationId: string;
  rounds: readonly Readonly<Round>[];
}>;

export type ConversationTranscriptMutationBaseline = Readonly<{
  conversations?: readonly Readonly<Conversation>[];
  messages?: readonly Readonly<Message>[];
  rounds?: readonly Readonly<Round>[];
  conversationVersions?: readonly Readonly<ConversationVersion>[];
}>;

export type ConversationTranscriptMutationCommand = Readonly<{
  conversationIds: readonly string[];
  operation: string;
  expected?: ConversationTranscriptMutationBaseline;
  put?: ConversationTranscriptMutationBatch;
  replaceMessages?: readonly ConversationTranscriptMessageReplacement[];
  replaceRounds?: readonly ConversationTranscriptRoundReplacement[];
}>;

export interface ConversationTranscriptMutationWriter {
  execute(command: ConversationTranscriptMutationCommand): Promise<void>;
}
