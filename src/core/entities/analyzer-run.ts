import type { AnalyzerError } from "@/core/entities/analyzer-error";

export type AnalyzerRunStatus = "idle" | "running" | "success" | "failed";

export type AnalyzerRun = {
  id: string;
  conversationId?: string;
  sourceId?: string;
  messageIds?: string[];
  providerId: string;
  providerName: string;
  status: AnalyzerRunStatus;
  startedAt: string;
  finishedAt?: string;
  error?: AnalyzerError;
};
