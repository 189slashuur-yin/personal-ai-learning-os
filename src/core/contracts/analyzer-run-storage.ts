import type { AnalyzerRun } from "@/core/entities/analyzer-run";

export interface AnalyzerRunStorage {
  save(run: AnalyzerRun): void;
  getAll(): AnalyzerRun[];
  getById(id: string): AnalyzerRun | null;
  getLatest(): AnalyzerRun | null;
  getLatestByConversationId(conversationId: string): AnalyzerRun | null;
  removeByConversationId(conversationId: string): void;
}
