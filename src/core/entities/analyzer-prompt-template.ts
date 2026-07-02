export type AnalyzerPromptMode = "source" | "messages";

export type AnalyzerPromptTemplate = {
  id: string;
  name: string;
  mode: AnalyzerPromptMode;
  template: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
