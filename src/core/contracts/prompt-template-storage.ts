import type {
  AnalyzerPromptMode,
  AnalyzerPromptTemplate,
} from "@/core/entities/analyzer-prompt-template";

export interface PromptTemplateStorage {
  getAll(): AnalyzerPromptTemplate[];
  getByMode(mode: AnalyzerPromptMode): AnalyzerPromptTemplate | null;
  replaceAll(templates: AnalyzerPromptTemplate[]): void;
}
