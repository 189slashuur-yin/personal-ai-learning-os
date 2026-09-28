import {
  KnowledgeContextConflictError, KnowledgeContextCommittedUnverifiedError,
  type KnowledgeContextMutationCommand, type KnowledgeContextMutationReceipt,
  type KnowledgeContextMutationWriter,
} from "@/core/contracts/knowledge-context-mutation-writer";
import { selection, validateKnowledgeRefs } from "@/core/services/knowledge-context-service";
import { BrowserConversationStorage } from "./browser-conversation-storage";

function equal(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
export class StorageBackedKnowledgeContextMutationWriter implements KnowledgeContextMutationWriter {
  constructor(private readonly storage = new BrowserConversationStorage()) {}
  async execute(command: KnowledgeContextMutationCommand): Promise<KnowledgeContextMutationReceipt> {
    if (!validateKnowledgeRefs(command.expectedRefs) || !validateKnowledgeRefs(command.nextRefs)) {
      throw new Error("Invalid Knowledge Context mutation refs.");
    }
    const conversation = this.storage.getById(command.conversationId);
    if (!conversation || !validateKnowledgeRefs(selection(conversation.knowledgeContextRefs)) ||
      !equal(selection(conversation.knowledgeContextRefs), command.expectedRefs)) throw new KnowledgeContextConflictError();
    this.storage.saveKnowledgeContext({ ...conversation, knowledgeContextRefs: command.nextRefs });
    try {
      const persisted = this.storage.getById(command.conversationId);
      if (!persisted || !equal(selection(persisted.knowledgeContextRefs), command.nextRefs)) {
        throw new Error("Knowledge Context read-back mismatch.");
      }
      return { conversationId: command.conversationId, knowledgeContextRefs: command.nextRefs, verified: true };
    } catch (error) { throw new KnowledgeContextCommittedUnverifiedError(error); }
  }
}
