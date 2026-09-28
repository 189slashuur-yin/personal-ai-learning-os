import type { KnowledgeContextRef } from "@/core/entities/knowledge-context-ref";

export type KnowledgeContextMutationCommand = Readonly<{
  conversationId: string;
  expectedRefs: KnowledgeContextRef[];
  nextRefs: KnowledgeContextRef[];
}>;
export type KnowledgeContextMutationReceipt = Readonly<{
  conversationId: string;
  knowledgeContextRefs: KnowledgeContextRef[];
  verified: true;
}>;
export interface KnowledgeContextMutationWriter {
  execute(command: KnowledgeContextMutationCommand): Promise<KnowledgeContextMutationReceipt>;
}
export class KnowledgeContextConflictError extends Error {
  constructor() { super("Knowledge Context changed since the expected baseline."); }
}
export class KnowledgeContextCommittedUnverifiedError extends Error {
  constructor(cause: unknown) { super("Knowledge Context committed but authoritative verification failed.", { cause }); }
}
