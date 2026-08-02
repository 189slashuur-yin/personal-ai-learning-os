import type { Conversation } from "@/core/entities/conversation";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";

export type ConversationVersionRestoreState = Readonly<{
  conversation: Readonly<Conversation>;
  messages: readonly Readonly<Message>[];
  rounds: readonly Readonly<Round>[];
}>;

export type ConversationVersionRestoreCommand = Readonly<{
  before: ConversationVersionRestoreState;
  after: ConversationVersionRestoreState;
}>;

export type ConversationVersionRestoreReceipt = Readonly<{
  conversation: Conversation;
  messages: Message[];
  rounds: Round[];
  referencesVerified: true;
}>;

export interface ConversationVersionRestoreWriter {
  execute(
    command: ConversationVersionRestoreCommand,
  ): Promise<ConversationVersionRestoreReceipt>;
}
