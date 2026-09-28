import type { Conversation } from "@/core/entities/conversation";
import {
  KnowledgeContextConflictError, KnowledgeContextCommittedUnverifiedError,
  type KnowledgeContextMutationCommand, type KnowledgeContextMutationReceipt,
  type KnowledgeContextMutationWriter,
} from "@/core/contracts/knowledge-context-mutation-writer";
import { selection, validateKnowledgeRefs } from "@/core/services/knowledge-context-service";
import { drainPendingWritesOrThrow, openPalosDB } from "./database";
import { getConversationCache, setConversationCache } from "./preload";

function equal(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function validate(command: KnowledgeContextMutationCommand): void {
  if (!validateKnowledgeRefs(command.expectedRefs) || !validateKnowledgeRefs(command.nextRefs)) {
    throw new Error("Invalid Knowledge Context mutation refs.");
  }
}
function write(command: KnowledgeContextMutationCommand): Promise<void> {
  return openPalosDB().then((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction("conversations", "readwrite");
    const store = tx.objectStore("conversations");
    const request = store.get(command.conversationId) as IDBRequest<Conversation | undefined>;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        const conversation = request.result;
        if (!conversation || !validateKnowledgeRefs(selection(conversation.knowledgeContextRefs)) ||
          !equal(selection(conversation.knowledgeContextRefs), command.expectedRefs)) {
          throw new KnowledgeContextConflictError();
        }
        store.put({ ...conversation, knowledgeContextRefs: command.nextRefs });
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(failure ?? tx.error ?? new Error("Knowledge Context transaction failed."));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error("Knowledge Context transaction aborted."));
  }));
}
function read(conversationId: string): Promise<Conversation | undefined> {
  return openPalosDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction("conversations", "readonly");
    const request = tx.objectStore("conversations").get(conversationId) as IDBRequest<Conversation | undefined>;
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? new Error("Knowledge Context read-back failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Knowledge Context read-back aborted."));
  }));
}
export class IndexedDBKnowledgeContextMutationWriter implements KnowledgeContextMutationWriter {
  async execute(command: KnowledgeContextMutationCommand): Promise<KnowledgeContextMutationReceipt> {
    validate(command);
    await drainPendingWritesOrThrow();
    await write(command);
    try {
      const conversation = await read(command.conversationId);
      if (!conversation || !equal(selection(conversation.knowledgeContextRefs), command.nextRefs)) {
        throw new Error("Knowledge Context read-back mismatch.");
      }
      const cache = getConversationCache();
      setConversationCache([...cache.filter((item) => item.id !== conversation.id), conversation]);
      return { conversationId: conversation.id, knowledgeContextRefs: command.nextRefs, verified: true };
    } catch (error) { throw new KnowledgeContextCommittedUnverifiedError(error); }
  }
}
