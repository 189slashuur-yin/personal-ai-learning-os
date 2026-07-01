import type { SourceStorage } from "@/core/contracts/source-storage";
import type { ImportedSource } from "@/core/entities/imported-source";

const CURRENT_SOURCE_KEY = "ai-learning-os.current-source";

export class BrowserSourceStorage implements SourceStorage {
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
}
