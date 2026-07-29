import type { AnalyzerRun } from "@/core/entities/analyzer-run";

export type AnalyzerRunDependencyIds = {
  conversationIds: readonly string[];
  sourceIds: readonly string[];
  roundIds: readonly string[];
  messageIds: readonly string[];
};

export interface AnalyzerRunStorage {
  save(run: AnalyzerRun): void;
  getAll(): AnalyzerRun[];
  getById(id: string): AnalyzerRun | null;
  getLatest(): AnalyzerRun | null;
  getLatestByConversationId(conversationId: string): AnalyzerRun | null;
  removeByConversationId(conversationId: string): void;
  removeByDependencies(dependencyIds: AnalyzerRunDependencyIds): void;
}
