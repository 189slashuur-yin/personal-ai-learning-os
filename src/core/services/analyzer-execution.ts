import type { AnalyzerRunStorage } from "@/core/contracts/analyzer-run-storage";
import type { AnalyzerProvider } from "@/core/contracts/analyzer-provider";
import type { AnalyzerError } from "@/core/entities/analyzer-error";
import type { AnalyzerRun } from "@/core/entities/analyzer-run";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";
import type { Round } from "@/core/entities/round";
import { AnalyzerOutputValidationError } from "@/core/services/analyzer-output-validator";
import { PromptTemplateService } from "@/core/services/prompt-template-service";

type AnalyzerExecutionResult = {
  run: AnalyzerRun;
  proposal?: Proposal;
};

type AnalyzerExecutionOptions = {
  simulateRecoverableError?: boolean;
};

class AnalyzerSafetyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly recoverable: boolean,
  ) {
    super(message);
  }
}

function toAnalyzerError(error: unknown, createdAt: string): AnalyzerError {
  if (error instanceof AnalyzerSafetyError) {
    return {
      code: error.code,
      message: error.message,
      recoverable: error.recoverable,
      createdAt,
    };
  }

  if (error instanceof AnalyzerOutputValidationError) {
    return {
      code: "INVALID_OUTPUT",
      message: error.message,
      recoverable: false,
      createdAt,
    };
  }

  return {
    code: "ANALYZER_FAILED",
    message: error instanceof Error ? error.message : "Analyzer 运行失败。",
    recoverable: true,
    createdAt,
  };
}

export class AnalyzerExecutionService {
  constructor(
    private readonly provider: AnalyzerProvider,
    private readonly promptTemplates: PromptTemplateService,
    private readonly runs: AnalyzerRunStorage,
  ) {}

  async runSource(
    source: ImportedSource,
    options: AnalyzerExecutionOptions = {},
  ): Promise<AnalyzerExecutionResult> {
    return this.execute(
      {
        conversationId: source.conversationId,
        sourceId: source.id,
      },
      "source",
      () => this.provider.analyzeSource(source),
      options,
    );
  }

  async runMessages(
    conversationId: string,
    messages: Message[],
    options: AnalyzerExecutionOptions = {},
  ): Promise<AnalyzerExecutionResult> {
    return this.execute(
      {
        conversationId,
        messageIds: messages.map((message) => message.id),
      },
      "messages",
      () => this.provider.analyzeMessages(conversationId, messages),
      options,
    );
  }

  async runRound(
    round: Round,
    messages: Message[],
    options: AnalyzerExecutionOptions = {},
  ): Promise<AnalyzerExecutionResult> {
    const timestamp = new Date().toISOString();
    const analysisMessages = messages.length
      ? messages
      : [
          ...(round.question
            ? [{
                id: `round-question-${round.id}`,
                conversationId: round.conversationId,
                role: "user" as const,
                content: round.question,
                order: 0,
                createdAt: timestamp,
                updatedAt: timestamp,
              }]
            : []),
          ...(round.answer
            ? [{
                id: `round-answer-${round.id}`,
                conversationId: round.conversationId,
                role: "assistant" as const,
                content: round.answer,
                order: 1,
                createdAt: timestamp,
                updatedAt: timestamp,
              }]
            : []),
        ];

    return this.execute(
      {
        conversationId: round.conversationId,
        roundId: round.id,
        messageIds: round.messageIds,
      },
      "messages",
      async () => {
        const proposal = await this.provider.analyzeMessages(
          round.conversationId,
          analysisMessages,
        );
        return {
          ...proposal,
          sourceType: "round",
          sourceRoundId: round.id,
          sourceMessageIds: [...round.messageIds],
          sourceEvidence: {
            ...proposal.sourceEvidence,
            sourceName: `Round ${round.order}: ${round.title}`,
          },
        };
      },
      options,
    );
  }

  private async execute(
    source: Pick<AnalyzerRun, "conversationId" | "sourceId" | "roundId" | "messageIds">,
    mode: "source" | "messages",
    analyze: () => Promise<Proposal>,
    options: AnalyzerExecutionOptions,
  ): Promise<AnalyzerExecutionResult> {
    const startedAt = new Date().toISOString();
    const running: AnalyzerRun = {
      id: crypto.randomUUID(),
      ...source,
      providerId: this.provider.providerInfo.id,
      providerName: this.provider.providerInfo.name,
      status: "running",
      startedAt,
    };
    this.runs.save(running);

    try {
      if (!this.provider.providerInfo.enabled) {
        throw new AnalyzerSafetyError(
          "PROVIDER_UNAVAILABLE",
          "当前 Analyzer Provider 不可用。",
          false,
        );
      }

      if (!this.promptTemplates.getCurrentTemplate(mode)) {
        throw new AnalyzerSafetyError(
          "MISSING_TEMPLATE",
          `缺少 ${mode} Analyzer 模板。`,
          false,
        );
      }

      if (options.simulateRecoverableError) {
        throw new AnalyzerSafetyError(
          "DEMO_SIMULATED_FAILURE",
          "Demo Provider 模拟了一个可恢复错误。",
          true,
        );
      }

      const proposal = await analyze();
      const successfulRun: AnalyzerRun = {
        ...running,
        status: "completed",
        finishedAt: new Date().toISOString(),
        latencyMs: Date.now() - Date.parse(startedAt),
      };
      this.runs.save(successfulRun);
      return { run: successfulRun, proposal };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const failedRun: AnalyzerRun = {
        ...running,
        status: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "failed",
        finishedAt,
        latencyMs: Date.now() - Date.parse(startedAt),
        error: toAnalyzerError(error, finishedAt),
      };
      this.runs.save(failedRun);
      return { run: failedRun };
    }
  }
}
