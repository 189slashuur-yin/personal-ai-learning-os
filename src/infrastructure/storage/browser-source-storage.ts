import type { SourceStorage } from "@/core/contracts/source-storage";
import type { ImportedSource } from "@/core/entities/imported-source";

const CURRENT_SOURCE_KEY = "ai-learning-os.current-source";
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
    window.localStorage.setItem(CURRENT_SOURCE_KEY, JSON.stringify(source));
  }

  getCurrent() {
    const storedSource = window.localStorage.getItem(CURRENT_SOURCE_KEY);

    if (!storedSource) {
      return null;
    }

    return JSON.parse(storedSource) as ImportedSource;
  }

  getByConversationId(conversationId: string) {
    return (
      this.getAll().find(
        (source) => source.conversationId === conversationId,
      ) ?? null
    );
  }

  private getAll() {
    const storedSources = window.localStorage.getItem(SOURCES_KEY);

    if (!storedSources) {
      return [];
    }

    return JSON.parse(storedSources) as ImportedSource[];
  }
}
