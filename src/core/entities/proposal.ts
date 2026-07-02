import type {
  AnalyzerRiskLevel,
  AnalyzerSuggestedAction,
} from "@/core/entities/analyzer-output-schema";
import type { ProviderCapability } from "@/core/entities/provider-capability";

export type Proposal = {
  id: string;
  sourceId?: string;
  conversationId?: string;
  sourceMessageIds?: string[];
  title: string;
  summary: string;
  sourceEvidence: {
    sourceName: string;
    excerpt: string;
  };
  generatedBy: "Demo Analyzer Generated";
  providerId?: string;
  providerName?: string;
  providerCapabilities?: ProviderCapability[];
  generatedAt?: string;
  analysisMode?: "source" | "messages";
  confidence?: number;
  suggestedAction?: AnalyzerSuggestedAction;
  riskLevel?: AnalyzerRiskLevel;
  status: "Pending" | "Accepted" | "Rejected" | "Applied";
  createdAt: string;
};
