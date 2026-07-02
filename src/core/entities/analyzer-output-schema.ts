export type AnalyzerSuggestedAction =
  | "create"
  | "update"
  | "merge"
  | "archive"
  | "ignore";

export type AnalyzerRiskLevel = "low" | "medium" | "high";

export type AnalyzerOutputSchema = {
  title: string;
  summary: string;
  evidence: string;
  confidence: number;
  suggestedAction: AnalyzerSuggestedAction;
  riskLevel: AnalyzerRiskLevel;
};
