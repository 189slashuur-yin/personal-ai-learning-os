import type { AnalyzerProvider } from "@/core/contracts/analyzer-provider";
import type { AIProvider } from "@/core/entities/ai-provider";
import type { AnalyzerPromptMode } from "@/core/entities/analyzer-prompt-template";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Message, MessageRole } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";
import type { ProviderConfiguration } from "@/core/entities/provider-configuration";
import {
  AnalyzerOutputValidationError,
  validateAnalyzerOutput,
} from "@/core/services/analyzer-output-validator";

type PromptTemplates = Record<AnalyzerPromptMode, string>;

type OllamaChatResponse = {
  message?: {
    content?: unknown;
  };
};

const messageRoleLabels: Record<MessageRole, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  unknown: "Unknown",
};

function endpoint(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function outputInstructions(template: string) {
  return `${template}\n\nReturn only one JSON object with exactly these fields: title (string), summary (string), evidence (string), confidence (number from 0 to 1), suggestedAction (one of create, update, merge, archive, ignore), riskLevel (one of low, medium, high). Do not wrap the JSON in markdown.`;
}

export class OllamaProvider implements AnalyzerProvider {
  readonly providerInfo: AIProvider;

  constructor(
    private readonly configuration: ProviderConfiguration,
    private readonly promptTemplates: PromptTemplates,
  ) {
    this.providerInfo = {
      id: "ollama",
      name: "Ollama",
      kind: "ollama",
      enabled: configuration.enabled,
      createdAt: configuration.createdAt,
      updatedAt: configuration.updatedAt,
    };
  }

  async analyzeSource(source: ImportedSource): Promise<Proposal> {
    const output = await this.requestAnalysis(
      outputInstructions(this.promptTemplates.source),
      `Source name: ${source.name}\n\nSource content:\n${source.content}`,
    );
    const generatedAt = new Date().toISOString();

    return {
      id: `source-proposal-${crypto.randomUUID()}`,
      sourceType: "source",
      sourceId: source.id,
      conversationId: source.conversationId,
      title: output.title,
      summary: output.summary,
      sourceEvidence: {
        sourceName: source.name,
        excerpt: output.evidence,
      },
      generatedBy: "Ollama Analyzer Generated",
      providerId: this.providerInfo.id,
      providerName: this.providerInfo.name,
      providerCapabilities: [...this.configuration.capabilities],
      generatedAt,
      analysisMode: "source",
      confidence: output.confidence,
      suggestedAction: output.suggestedAction,
      riskLevel: output.riskLevel,
      status: "Pending",
      createdAt: generatedAt,
    };
  }

  async analyzeMessages(
    conversationId: string,
    selectedMessages: Message[],
  ): Promise<Proposal> {
    if (selectedMessages.length === 0) {
      throw new Error("Ollama Analyzer 至少需要一条 Message。");
    }

    const orderedMessages = [...selectedMessages].sort(
      (left, right) => left.order - right.order,
    );
    const evidence = orderedMessages
      .map(
        (message) =>
          `${messageRoleLabels[message.role]}: ${message.content.trim()}`,
      )
      .join("\n\n");
    const output = await this.requestAnalysis(
      outputInstructions(this.promptTemplates.messages),
      `Selected conversation messages in original order:\n\n${evidence}`,
    );
    const generatedAt = new Date().toISOString();

    return {
      id: `message-proposal-${crypto.randomUUID()}`,
      sourceType: "messages",
      conversationId,
      sourceMessageIds: orderedMessages.map((message) => message.id),
      title: output.title,
      summary: output.summary,
      sourceEvidence: {
        sourceName: `Conversation Messages（${orderedMessages.length} 条）`,
        excerpt: output.evidence,
      },
      generatedBy: "Ollama Analyzer Generated",
      providerId: this.providerInfo.id,
      providerName: this.providerInfo.name,
      providerCapabilities: [...this.configuration.capabilities],
      generatedAt,
      analysisMode: "messages",
      confidence: output.confidence,
      suggestedAction: output.suggestedAction,
      riskLevel: output.riskLevel,
      status: "Pending",
      createdAt: generatedAt,
    };
  }

  private async requestAnalysis(systemPrompt: string, userPrompt: string) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(
      () => controller.abort(),
      this.configuration.timeout,
    );

    try {
      const response = await fetch(endpoint(this.configuration.baseUrl, "/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.configuration.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: false,
          format: "json",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const details = (await response.text()).trim();
        throw new Error(
          `Ollama 请求失败（HTTP ${response.status}）${details ? `：${details}` : ""}`,
        );
      }

      const responseBody = (await response.json()) as OllamaChatResponse;
      const content = responseBody.message?.content;

      if (typeof content !== "string" || !content.trim()) {
        throw new AnalyzerOutputValidationError(["Ollama 返回了空的分析结果"]);
      }

      let parsedOutput: unknown;
      try {
        parsedOutput = JSON.parse(content);
      } catch {
        throw new AnalyzerOutputValidationError([
          "Ollama 返回的内容不是合法 JSON",
        ]);
      }

      return validateAnalyzerOutput(parsedOutput);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          `Ollama 请求在 ${this.configuration.timeout} ms 后超时。`,
        );
      }

      if (error instanceof TypeError) {
        throw new Error(
          `无法连接 Ollama（${this.configuration.baseUrl}）。请确认本地 Ollama service 已启动。`,
        );
      }

      throw error;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}
