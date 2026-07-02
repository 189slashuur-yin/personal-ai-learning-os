import type { AIProvider } from "@/core/entities/ai-provider";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";

export interface AnalyzerProvider {
  readonly providerInfo: AIProvider;
  analyzeSource(source: ImportedSource): Proposal;
  analyzeMessages(
    conversationId: string,
    selectedMessages: Message[],
  ): Proposal;
}
