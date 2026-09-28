import type {
  AnalyzerRiskLevel,
  AnalyzerSuggestedAction,
} from "@/core/entities/analyzer-output-schema";
import type { ProviderCapability } from "@/core/entities/provider-capability";
import type { KnowledgeReuseAuditItem } from "@/core/entities/knowledge-context-ref";

export type Proposal = {
  id: string;
  sourceType?: "round" | "conversation" | "source" | "messages";
  sourceRoundId?: string;
  sourceId?: string;
  conversationId?: string;
  sourceMessageIds?: string[];
  title: string;
  summary: string;
  sourceEvidence: {
    sourceName: string;
    excerpt: string;
  };
  generatedBy: "Demo Analyzer Generated" | "Ollama Analyzer Generated";
  providerId?: string;
  providerName?: string;
  providerCapabilities?: ProviderCapability[];
  generatedAt?: string;
  analysisMode?: "source" | "messages";
  confidence?: number;
  suggestedAction?: AnalyzerSuggestedAction;
  riskLevel?: AnalyzerRiskLevel;
  status: "Pending" | "Accepted" | "Rejected" | "Applied";
  purpose?: "knowledge-create" | "knowledge-update" | "summary";
  targetKnowledgeId?: string;
  createdAt: string;
  knowledgeReuseAudit?: KnowledgeReuseAuditItem[];
};
