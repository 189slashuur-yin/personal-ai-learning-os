import type { AnalyzerError } from "@/core/entities/analyzer-error";
import type { KnowledgeReuseAuditItem } from "@/core/entities/knowledge-context-ref";

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
  knowledgeReuseAudit?: KnowledgeReuseAuditItem[];
};
