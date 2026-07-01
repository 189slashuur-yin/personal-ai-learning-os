import type { ImportedSource } from "@/core/entities/imported-source";

export interface SourceStorage {
  saveCurrent(source: ImportedSource): void;
  getCurrent(): ImportedSource | null;
}
