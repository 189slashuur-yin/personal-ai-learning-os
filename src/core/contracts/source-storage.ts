import type { ImportedSource } from "@/core/entities/imported-source";

export interface SourceStorage {
  save(source: ImportedSource): void;
  saveCurrent(source: ImportedSource): void;
  getCurrent(): ImportedSource | null;
  getAll(): ImportedSource[];
  getByConversationId(conversationId: string): ImportedSource | null;
  removeByConversationId(conversationId: string): void;
}
