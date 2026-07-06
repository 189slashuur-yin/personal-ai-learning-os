import type { SourceStorage } from "@/core/contracts/source-storage";
import type { ImportedSource } from "@/core/entities/imported-source";

export class InMemorySourceStorage implements SourceStorage {
  private store = new Map<string, ImportedSource>();
  private current: ImportedSource | null = null;

  save(source: ImportedSource): void {
    this.store.set(source.id, { ...source });
  }

  saveCurrent(source: ImportedSource): void {
    this.current = { ...source };
    this.store.set(source.id, { ...source });
  }

  getCurrent(): ImportedSource | null {
    return this.current;
  }

  getAll(): ImportedSource[] {
    return [...this.store.values()];
  }

  getByConversationId(conversationId: string): ImportedSource | null {
    return (
      [...this.store.values()].find(
        (s) => s.conversationId === conversationId,
      ) ?? null
    );
  }

  removeByConversationId(conversationId: string): void {
    for (const [id, source] of this.store) {
      if (source.conversationId === conversationId) {
        this.store.delete(id);
      }
    }
    if (this.current?.conversationId === conversationId) {
      this.current = null;
    }
  }

  clear(): void {
    this.store.clear();
    this.current = null;
  }
}
