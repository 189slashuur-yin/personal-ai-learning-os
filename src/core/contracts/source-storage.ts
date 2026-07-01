import type { ImportedSource } from "@/core/entities/imported-source";

export interface SourceStorage {
  save(source: ImportedSource): void;
  saveCurrent(source: ImportedSource): void;
  getCurrent(): ImportedSource | null;
  getByConversationId(conversationId: string): ImportedSource | null;
}
