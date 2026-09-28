import type { AIProvider } from "@/core/entities/ai-provider";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";
import type { KnowledgeReuseAuditItem } from "@/core/entities/knowledge-context-ref";

export type AnalyzerSupplementalContext = {
  referencedKnowledge: KnowledgeReuseAuditItem[];
};

export interface AnalyzerProvider {
  readonly providerInfo: AIProvider;
  analyzeSource(source: ImportedSource, supplementalContext?: AnalyzerSupplementalContext): Promise<Proposal>;
  analyzeMessages(
    conversationId: string,
    selectedMessages: Message[],
    supplementalContext?: AnalyzerSupplementalContext,
  ): Promise<Proposal>;
}
