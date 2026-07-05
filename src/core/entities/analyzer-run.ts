import type { AnalyzerError } from "@/core/entities/analyzer-error";

export type AnalyzerRunStatus = "idle" | "queued" | "running" | "completed" | "failed" | "timeout";

export type AnalyzerRun = {
  id: string;
  conversationId?: string;
  sourceId?: string;
  roundId?: string;
  messageIds?: string[];
  providerId: string;
  providerName: string;
  status: AnalyzerRunStatus;
  startedAt: string;
  finishedAt?: string;
  latencyMs?: number;
  error?: AnalyzerError;
};
