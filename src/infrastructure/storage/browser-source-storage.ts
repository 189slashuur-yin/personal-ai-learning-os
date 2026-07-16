import type { SourceStorage } from "@/core/contracts/source-storage";
import type { ImportedSource } from "@/core/entities/imported-source";
import {
  clearCurrentSourcePointer,
  readCurrentSourcePointer,
  writeCurrentSourcePointer,
} from "@/infrastructure/storage/flow-pointers";

const SOURCES_KEY = "ai-learning-os.sources";

export class BrowserSourceStorage implements SourceStorage {
  save(source: ImportedSource) {
    const sources = this.getAll();
    const existingIndex = sources.findIndex(
      (storedSource) => storedSource.id === source.id,
    );

    if (existingIndex >= 0) {
      sources[existingIndex] = source;
    } else {
      sources.push(source);
    }

    window.localStorage.setItem(SOURCES_KEY, JSON.stringify(sources));
    this.saveCurrent(source);
  }

  saveCurrent(source: ImportedSource) {
    writeCurrentSourcePointer(source);
  }

  getCurrent() {
    const source = readCurrentSourcePointer();
    return source ? this.normalize(source) : null;
  }

  getByConversationId(conversationId: string) {
    return (
      this.getAll()
        .filter((source) => source.conversationId === conversationId)
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        )[0] ?? null
    );
  }

  removeByConversationId(conversationId: string) {
    const sources = this.getAll();
    const removedSourceIds = new Set(
      sources
        .filter((source) => source.conversationId === conversationId)
        .map((source) => source.id),
    );
    const remainingSources = sources.filter(
      (source) => source.conversationId !== conversationId,
    );

    window.localStorage.setItem(SOURCES_KEY, JSON.stringify(remainingSources));

    const currentSource = this.getCurrent();
    if (currentSource && removedSourceIds.has(currentSource.id)) {
      clearCurrentSourcePointer();
    }
  }

  getAll() {
    const storedSources = window.localStorage.getItem(SOURCES_KEY);

    if (!storedSources) {
      return [];
    }

    return (JSON.parse(storedSources) as ImportedSource[]).map((source) =>
      this.normalize(source),
    );
  }

  private normalize(source: ImportedSource) {
    return {
      ...source,
      updatedAt: source.updatedAt ?? source.importedAt,
    };
  }
}
