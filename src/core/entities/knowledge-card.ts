import type { ProviderCapability } from "@/core/entities/provider-capability";

export type KnowledgeCard = {
  id: string;
  proposalId: string;
  title: string;
  content: string;
  summary: string;
  sourceFile: string;
  sourceId?: string;
  sourceConversationId?: string;
  sourceMessageIds?: string[];
  sourceMessageCount?: number;
  sourceEvidenceExcerpt?: string;
  providerName?: string;
  providerCapabilitySnapshot?: ProviderCapability[];
  generatedAt?: string;
  analysisMode?: "source" | "messages";
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  status: "Active" | "Archived";
};
