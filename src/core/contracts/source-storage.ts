import type { ImportedSource } from "@/core/entities/imported-source";
import type { ConversationTranscriptMutationCommand } from "@/core/contracts/conversation-transcript-mutation-writer";

export interface SourceStorage {
  save(source: ImportedSource): void;
  saveCurrent(source: ImportedSource): void;
  getCurrent(): ImportedSource | null;
  getAll(): ImportedSource[];
  getByConversationId(conversationId: string): ImportedSource | null;
  removeByConversationId(conversationId: string): void;
  executeAuthoritativeTranscriptMutation?(
    command: ConversationTranscriptMutationCommand,
  ): Promise<void>;
}
