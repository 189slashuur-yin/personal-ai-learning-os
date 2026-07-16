import type { SourceStorage } from "@/core/contracts/source-storage";
import type { ImportedSource } from "@/core/entities/imported-source";
import {
  clearCurrentSourcePointer,
  readCurrentSourcePointer,
  writeCurrentSourcePointer,
} from "@/infrastructure/storage/flow-pointers";
import { getSourceCache, setSourceCache } from "./preload";
import { deleteWhere, persistInBackground, writeOne } from "./database";

function normalize(source: ImportedSource): ImportedSource {
  return {
    ...source,
    updatedAt: source.updatedAt ?? source.importedAt,
  };
}

export class IndexedDBSourceStorage implements SourceStorage {
  save(source: ImportedSource): void {
    const norm = normalize(source);
    const cache = getSourceCache();
    const idx = cache.findIndex((s) => s.id === norm.id);
    if (idx >= 0) cache[idx] = norm;
    else cache.push(norm);
    persistInBackground("save source", writeOne("sources", norm));
    this.saveCurrent(norm);
  }

  saveCurrent(source: ImportedSource): void {
    try {
      writeCurrentSourcePointer(source);
    } catch {
      // localStorage quota exceeded for current-source; non-critical
    }
  }

  getCurrent(): ImportedSource | null {
    const source = readCurrentSourcePointer();
    return source ? normalize(source) : null;
  }

  getAll(): ImportedSource[] {
    return getSourceCache().map(normalize);
  }

  getByConversationId(conversationId: string): ImportedSource | null {
    return (
      this.getAll()
        .filter((s) => s.conversationId === conversationId)
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        )[0] ?? null
    );
  }

  removeByConversationId(conversationId: string): void {
    const cache = getSourceCache();
    const removedIds = new Set(
      cache
        .filter((s) => s.conversationId === conversationId)
        .map((s) => s.id),
    );
    const remaining = cache.filter((s) => s.conversationId !== conversationId);
    setSourceCache(remaining);
    persistInBackground(
      "remove sources by conversation",
      deleteWhere<ImportedSource>(
        "sources",
        (source) => source.conversationId === conversationId,
      ),
    );

    const current = this.getCurrent();
    if (current && removedIds.has(current.id)) {
      try {
        clearCurrentSourcePointer();
      } catch {
        // ignore
      }
    }
  }
}
