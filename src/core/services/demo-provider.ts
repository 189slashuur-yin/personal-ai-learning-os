import type { AnalyzerProvider } from "@/core/contracts/analyzer-provider";
import type { AIProvider } from "@/core/entities/ai-provider";
import type { AnalyzerOutputSchema } from "@/core/entities/analyzer-output-schema";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Message, MessageRole } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";
import { DEMO_PROVIDER_CAPABILITIES } from "@/core/entities/provider-capability";
import { validateAnalyzerOutput } from "@/core/services/analyzer-output-validator";

const SUMMARY_LENGTH = 120;
const EVIDENCE_LENGTH = 200;
const PROVIDER_CREATED_AT = "2026-01-01T00:00:00.000Z";

const messageRoleLabels: Record<MessageRole, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  unknown: "Unknown",
};

function normalizeText(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

function excerpt(content: string, length: number) {
  return content.length > length ? `${content.slice(0, length)}…` : content;
}

export const demoProviderInfo: AIProvider = {
  id: "demo",
  name: "Demo Provider",
  kind: "demo",
  enabled: true,
  createdAt: PROVIDER_CREATED_AT,
  updatedAt: PROVIDER_CREATED_AT,
};

export class DemoProvider implements AnalyzerProvider {
  readonly providerInfo = demoProviderInfo;

  async analyzeSource(source: ImportedSource): Promise<Proposal> {
    const content = normalizeText(source.content);
    const sourceTitle = source.name.replace(/\.txt$/i, "");
    const generatedAt = new Date().toISOString();

    const output: AnalyzerOutputSchema = {
      title: `关于「${sourceTitle}」的内容提炼`,
      summary: excerpt(content, SUMMARY_LENGTH),
      evidence: excerpt(content, EVIDENCE_LENGTH),
      confidence: 0.82,
      suggestedAction: "create",
      riskLevel: "low",
    };
    const validatedOutput = validateAnalyzerOutput(output);

    return {
      id: `source-proposal-${crypto.randomUUID()}`,
      sourceType: "source",
      sourceId: source.id,
      conversationId: source.conversationId,
      title: validatedOutput.title,
      summary: validatedOutput.summary,
      sourceEvidence: {
        sourceName: source.name,
        excerpt: validatedOutput.evidence,
      },
      generatedBy: "Demo Analyzer Generated",
      providerId: this.providerInfo.id,
      providerName: this.providerInfo.name,
      providerCapabilities: [...DEMO_PROVIDER_CAPABILITIES],
      generatedAt,
      analysisMode: "source",
      confidence: validatedOutput.confidence,
      suggestedAction: validatedOutput.suggestedAction,
      riskLevel: validatedOutput.riskLevel,
      status: "Pending",
      createdAt: generatedAt,
    };
  }

  async analyzeMessages(
    conversationId: string,
    selectedMessages: Message[],
  ): Promise<Proposal> {
    if (selectedMessages.length === 0) {
      throw new Error("Demo Analyzer 至少需要一条 Message。");
    }

    const orderedMessages = [...selectedMessages].sort(
      (left, right) => left.order - right.order,
    );
    const evidence = orderedMessages
      .map(
        (message) =>
          `${messageRoleLabels[message.role]}：${message.content.trim()}`,
      )
      .join("\n\n");
    const normalizedEvidence = normalizeText(evidence);
    const generatedAt = new Date().toISOString();
    const output: AnalyzerOutputSchema = {
      title: `基于 ${orderedMessages.length} 条 Message 的内容提炼`,
      summary: excerpt(normalizedEvidence, SUMMARY_LENGTH),
      evidence,
      confidence: 0.78,
      suggestedAction: "create",
      riskLevel: "low",
    };
    const validatedOutput = validateAnalyzerOutput(output);

    return {
      id: `message-proposal-${crypto.randomUUID()}`,
      sourceType: "messages",
      conversationId,
      sourceMessageIds: orderedMessages.map((message) => message.id),
      title: validatedOutput.title,
      summary: validatedOutput.summary,
      sourceEvidence: {
        sourceName: `Conversation Messages（${orderedMessages.length} 条）`,
        excerpt: validatedOutput.evidence,
      },
      generatedBy: "Demo Analyzer Generated",
      providerId: this.providerInfo.id,
      providerName: this.providerInfo.name,
      providerCapabilities: [...DEMO_PROVIDER_CAPABILITIES],
      generatedAt,
      analysisMode: "messages",
      confidence: validatedOutput.confidence,
      suggestedAction: validatedOutput.suggestedAction,
      riskLevel: validatedOutput.riskLevel,
      status: "Pending",
      createdAt: generatedAt,
    };
  }
}
