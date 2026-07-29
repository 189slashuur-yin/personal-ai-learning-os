import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";
import type { ShareSnapshotCanonicalWriter } from "@/core/contracts/share-snapshot-canonical-writer";
import type { SourceStorage } from "@/core/contracts/source-storage";
import {
  isChatGPTShareSnapshotMetadata,
  isLegacyChatGPTShareSnapshotMetadata,
} from "@/core/entities/imported-source";
import type {
  ShareSnapshotBaseline,
  ShareSnapshotBaselineKind,
} from "@/core/models/share-snapshot-baseline";
import {
  buildShareSnapshotBaseline,
  sourceMatchesShareIdentity,
} from "@/core/models/share-snapshot-baseline";
import type {
  ShareSnapshotCaptureRequest,
  ShareSnapshotPreview,
  ShareSnapshotPreviewConfirmation,
  ShareSnapshotPreviewSummary,
  ShareSnapshotResolvedTarget,
  ShareSnapshotWorkflowStatus,
} from "@/core/models/share-snapshot-preview";
import type { ShareSnapshotWorkflowResult } from "@/core/models/share-snapshot-workflow-result";
import {
  prepareChatGPTShareSnapshot,
  type ChatGPTShareSnapshotCanonicalPlan,
  type ChatGPTShareSnapshotIdKind,
  type ChatGPTShareSnapshotPreparation,
  type ChatGPTShareSnapshotTarget,
} from "@/core/services/chatgpt-share-snapshot-service";
import {
  identifyChatGPTConversationSourceUrl,
  identifyChatGPTShareUrl,
  identifyPalosLocalSnapshotSource,
  shareResourceFingerprint,
  type ChatGPTShareIdentity,
} from "@/core/services/chatgpt-share-snapshot-url";
import { resolveChatGPTShareSnapshotHistory } from "@/core/services/chatgpt-share-snapshot-history";

export type ChatGPTShareSnapshotWorkflowStorages = {
  conversations: ConversationStorage;
  sources: SourceStorage;
  messages: MessageStorage;
  rounds: RoundStorage;
};

export type ChatGPTShareSnapshotWorkflowDependencies = {
  writer: ShareSnapshotCanonicalWriter;
  createId: (kind: ChatGPTShareSnapshotIdKind) => string;
  createPreviewId: () => string;
  now: () => string;
};

type InternalPreview = {
  preview: ShareSnapshotPreview;
  baseline?: ShareSnapshotBaseline;
  plan?: ChatGPTShareSnapshotCanonicalPlan;
  lifecycle: "ready" | "confirming" | "consumed";
};

const EMPTY_SUMMARY: ShareSnapshotPreviewSummary = {
  existingMessageCount: 0,
  snapshotMessageCount: 0,
  newMessageCount: 0,
  existingRoundCount: 0,
  newRoundCount: 0,
};

export const CONVERSATION_SNAPSHOT_CONTENT_REQUIRED_MESSAGE =
  "链接只用于识别来源，不能单独导入对话。\n请上传已保存的网页 HTML，或粘贴完整对话内容。";

export function validateConversationSnapshotContent(
  request: Pick<ShareSnapshotCaptureRequest, "snapshot">,
): string | null {
  return request.snapshot.content.trim()
    ? null
    : CONVERSATION_SNAPSHOT_CONTENT_REQUIRED_MESSAGE;
}

function preparationStatus(
  preparation: ChatGPTShareSnapshotPreparation,
): ShareSnapshotWorkflowStatus {
  return preparation.status;
}

function preparationSummary(
  preparation: ChatGPTShareSnapshotPreparation,
  existingRoundCount: number,
): ShareSnapshotPreviewSummary {
  return {
    existingMessageCount: preparation.comparison?.existingMessageCount ?? 0,
    snapshotMessageCount: preparation.parsed.messages.length,
    newMessageCount: preparation.importPlan?.importedMessageCount ?? 0,
    existingRoundCount,
    newRoundCount: preparation.importPlan?.importedRoundCount ?? 0,
  };
}

export class ChatGPTShareSnapshotWorkflow {
  private readonly previews = new Map<string, InternalPreview>();

  constructor(
    private readonly storages: ChatGPTShareSnapshotWorkflowStorages,
    private readonly dependencies: ChatGPTShareSnapshotWorkflowDependencies,
  ) {}

  async preview(
    request: ShareSnapshotCaptureRequest,
  ): Promise<ShareSnapshotPreview> {
    const previewId = this.allocatePreviewId();
    const contentError = validateConversationSnapshotContent(request);
    if (contentError) {
      return this.storeTerminalPreview({
        previewId,
        status: "invalid",
        summary: EMPTY_SUMMARY,
        confirmable: false,
        warnings: [],
        errors: [contentError],
      });
    }

    const allSources = this.storages.sources.getAll();
    const preferredSourceUrl = request.sourceUrl?.trim() ?? "";
    const legacySourceUrl = request.shareUrl?.trim() ?? "";
    if (
      preferredSourceUrl &&
      legacySourceUrl &&
      preferredSourceUrl !== legacySourceUrl
    ) {
      return this.storeTerminalPreview({
        previewId,
        status: "invalid",
        summary: EMPTY_SUMMARY,
        confirmable: false,
        warnings: [],
        errors: ["一次 Snapshot capture 只能提供一个来源链接。"],
      });
    }
    const sourceUrl = preferredSourceUrl || legacySourceUrl;
    let identity: ChatGPTShareIdentity;
    try {
      if (sourceUrl) {
        identity = await identifyChatGPTConversationSourceUrl(sourceUrl);
      } else if (request.target?.kind === "existing") {
        const targetConversationId = request.target.conversationId;
        const targetSources = allSources.filter(
          (source) =>
            source.conversationId === targetConversationId &&
            isChatGPTShareSnapshotMetadata(source.shareSnapshot),
        );
        const resourceHashes = new Set(
          targetSources.flatMap((source) =>
            isChatGPTShareSnapshotMetadata(source.shareSnapshot)
              ? [source.shareSnapshot.resourceHash]
              : [],
          ),
        );
        if (resourceHashes.size === 0) {
          const hasLegacyHistory = allSources.some(
            (source) =>
              source.conversationId === targetConversationId &&
              isLegacyChatGPTShareSnapshotMetadata(source.shareSnapshot),
          );
          return this.storeTerminalPreview({
            previewId,
            status: "invalid",
            summary: EMPTY_SUMMARY,
            confirmable: false,
            warnings: [],
            errors: [
              hasLegacyHistory
                ? "所选 Conversation 只有旧版 Snapshot metadata；请先完成显式 legacy migration。"
                : "所选 Conversation 没有可用的 Snapshot history，无法在不提供来源链接时判断更新基线。",
            ],
          });
        }
        if (resourceHashes.size > 1) {
          return this.storeTerminalPreview({
            previewId,
            status: "ambiguous",
            summary: EMPTY_SUMMARY,
            confirmable: false,
            warnings: [],
            errors: [
              "所选 Conversation 存在多个 Snapshot resource identity，无法自动选择更新基线。",
            ],
          });
        }
        identity = { resourceHash: [...resourceHashes][0] };
      } else {
        identity = await identifyPalosLocalSnapshotSource(
          request.newConversation.id,
        );
      }
    } catch (error) {
      return this.storeTerminalPreview({
        previewId,
        status: "invalid",
        summary: EMPTY_SUMMARY,
        confirmable: false,
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }

    for (const source of allSources) {
      if (!isLegacyChatGPTShareSnapshotMetadata(source.shareSnapshot)) continue;
      try {
        const legacyIdentity = await identifyChatGPTShareUrl(
          source.shareSnapshot.normalizedShareUrl,
        );
        if (legacyIdentity.resourceHash === identity.resourceHash) {
          return this.storeTerminalPreview({
            previewId,
            resourceFingerprint: shareResourceFingerprint(
              identity.resourceHash,
            ),
            status: "invalid",
            summary: EMPTY_SUMMARY,
            confirmable: false,
            warnings: [],
            errors: [
              `Share Snapshot source ${source.id} requires explicit legacy migration.`,
            ],
          });
        }
      } catch {
        // A malformed legacy URL cannot claim the incoming resource.
      }
    }

    const matchingSources = allSources.filter(
      (source) =>
        isChatGPTShareSnapshotMetadata(source.shareSnapshot) &&
        source.shareSnapshot.resourceHash === identity.resourceHash,
    );
    const capturedAt = this.dependencies.now();
    let target: ChatGPTShareSnapshotTarget;
    let resolvedTarget: ShareSnapshotResolvedTarget;
    let baselineKind: ShareSnapshotBaselineKind;
    let sourceId: string | undefined;
    let existingRoundCount = 0;

    if (matchingSources.length === 0) {
      if (request.target?.kind === "existing") {
        return this.storeTerminalPreview({
          previewId,
          resourceFingerprint: shareResourceFingerprint(identity.resourceHash),
          status: "invalid",
          summary: EMPTY_SUMMARY,
          confirmable: false,
          warnings: [],
          errors: [
            sourceUrl
              ? "这个来源链接与所选 Conversation 的 Snapshot history 不匹配。请清空链接以使用现有本地 history，或选择正确的 Conversation。"
              : "所选 Conversation 没有可用的 Snapshot history。",
          ],
        });
      }
      if (
        this.storages.conversations.getById(request.newConversation.id) !== null
      ) {
        return this.storeTerminalPreview({
          previewId,
          resourceFingerprint: shareResourceFingerprint(identity.resourceHash),
          status: "invalid",
          summary: EMPTY_SUMMARY,
          confirmable: false,
          warnings: [],
          errors: [
            `Conversation ${request.newConversation.id} already exists and cannot be used as a new Share target.`,
          ],
        });
      }
      target = { kind: "new", conversation: request.newConversation };
      resolvedTarget = {
        kind: "new",
        conversationId: request.newConversation.id,
        conversationTitle: request.newConversation.title,
      };
      baselineKind = "new";
    } else {
      const ownerIds = new Set(
        matchingSources.map(({ conversationId }) => conversationId),
      );
      if (ownerIds.size > 1) {
        return this.storeTerminalPreview({
          previewId,
          resourceFingerprint: shareResourceFingerprint(identity.resourceHash),
          status: "ambiguous",
          summary: EMPTY_SUMMARY,
          confirmable: false,
          warnings: [],
          errors: ["Share Snapshot resource belongs to multiple Conversations."],
        });
      }
      const conversationId = matchingSources[0].conversationId;
      if (
        request.target?.kind === "existing" &&
        conversationId !== request.target.conversationId
      ) {
        const actualOwner = conversationId
          ? this.storages.conversations.getById(conversationId)
          : null;
        return this.storeTerminalPreview({
          previewId,
          resourceFingerprint: shareResourceFingerprint(identity.resourceHash),
          status: "invalid",
          summary: EMPTY_SUMMARY,
          confirmable: false,
          warnings: [],
          errors: [
            `来源 identity 属于「${actualOwner?.title ?? conversationId ?? "未知 Conversation"}」，与当前选择不一致。`,
          ],
        });
      }
      if (!conversationId) {
        return this.storeTerminalPreview({
          previewId,
          resourceFingerprint: shareResourceFingerprint(identity.resourceHash),
          status: "invalid",
          summary: EMPTY_SUMMARY,
          confirmable: false,
          warnings: [],
          errors: ["Share Snapshot history has no owning Conversation."],
        });
      }
      const history = resolveChatGPTShareSnapshotHistory({
        conversationId,
        resourceHash: identity.resourceHash,
        sources: allSources,
      });
      if (history.status === "blocked") {
        const status =
          history.reason === "ambiguous-resource" ? "ambiguous" : "blocked";
        return this.storeTerminalPreview({
          previewId,
          resourceFingerprint: shareResourceFingerprint(identity.resourceHash),
          status,
          summary: EMPTY_SUMMARY,
          confirmable: false,
          warnings: [],
          errors: [`Share Snapshot history is blocked: ${history.reason}.`],
        });
      }
      const source = history.head;
      if (!source) {
        return this.storeTerminalPreview({
          previewId,
          resourceFingerprint: shareResourceFingerprint(identity.resourceHash),
          status: "invalid",
          summary: EMPTY_SUMMARY,
          confirmable: false,
          warnings: [],
          errors: ["Share Snapshot history has no head Source."],
        });
      }
      const conversation = conversationId
        ? this.storages.conversations.getById(conversationId)
        : null;
      if (!conversationId || !conversation) {
        return this.storeTerminalPreview({
          previewId,
          resourceFingerprint: shareResourceFingerprint(identity.resourceHash),
          status: "invalid",
          summary: EMPTY_SUMMARY,
          confirmable: false,
          warnings: [],
          errors: [
            `Share Snapshot source ${source.id} has no valid owning Conversation.`,
          ],
        });
      }
      const historySourceIds = new Set(history.chain.map(({ id }) => id));
      const crossOwnedMessage = this.storages.messages
        .getAll()
        .find(
          (message) =>
            message.sourceId &&
            historySourceIds.has(message.sourceId) &&
            message.conversationId !== conversationId,
        );
      if (crossOwnedMessage) {
        return this.storeTerminalPreview({
          previewId,
          resourceFingerprint: shareResourceFingerprint(identity.resourceHash),
          status: "invalid",
          summary: EMPTY_SUMMARY,
          confirmable: false,
          warnings: [],
          errors: [
            `Share Snapshot source ${source.id} is referenced across Conversations.`,
          ],
        });
      }
      const messages =
        this.storages.messages.getByConversationId(conversationId);
      const rounds = this.storages.rounds.getByConversationId(conversationId);
      target = {
        kind: "existing",
        conversation,
        source,
        messages,
        rounds,
      };
      resolvedTarget = {
        kind: "existing",
        conversationId,
        conversationTitle: conversation.title,
        sourceId: source.id,
      };
      baselineKind = "existing";
      sourceId = source.id;
      existingRoundCount = rounds.length;
    }

    const preparation = await prepareChatGPTShareSnapshot({
      identity,
      snapshot: request.snapshot,
      capturedAt,
      target,
      createId: this.dependencies.createId,
    });
    const baseline = await this.captureBaseline({
      kind: baselineKind,
      conversationId: resolvedTarget.conversationId,
      sourceId,
      identity,
    });
    const confirmable = Boolean(
      preparation.canonicalPlan &&
        (preparation.status === "new" || preparation.status === "append"),
    );
    const preview: ShareSnapshotPreview = {
      previewId,
      resourceFingerprint: shareResourceFingerprint(identity.resourceHash),
      status: preparationStatus(preparation),
      target: resolvedTarget,
      summary: preparationSummary(preparation, existingRoundCount),
      baselineFingerprint: baseline.fingerprint,
      confirmable,
      warnings: [...preparation.warnings],
      errors: [...preparation.errors],
    };
    this.previews.set(previewId, {
      preview,
      baseline,
      plan: confirmable ? preparation.canonicalPlan : undefined,
      lifecycle: "ready",
    });
    return preview;
  }

  async confirm(
    confirmation: ShareSnapshotPreviewConfirmation,
  ): Promise<ShareSnapshotWorkflowResult> {
    const stored = this.previews.get(confirmation.previewId);
    if (!stored || stored.lifecycle !== "ready") {
      return {
        status: "stale",
        previewId: confirmation.previewId,
        message: "Share Snapshot preview is missing, consumed, or in progress.",
      };
    }
    const { preview } = stored;
    if (
      preview.status === "ambiguous" ||
      preview.status === "invalid" ||
      preview.status === "blocked"
    ) {
      return {
        status: preview.status,
        previewId: preview.previewId,
        errors: [...preview.errors],
      };
    }
    if (
      !stored.baseline ||
      confirmation.baselineFingerprint !== stored.baseline.fingerprint
    ) {
      this.consume(stored);
      return {
        status: "stale",
        previewId: preview.previewId,
        message: "Share Snapshot preview confirmation does not match its baseline.",
      };
    }

    const currentBaseline = await this.captureBaseline(stored.baseline);
    if (currentBaseline.fingerprint !== stored.baseline.fingerprint) {
      this.consume(stored);
      return {
        status: "stale",
        previewId: preview.previewId,
        message: "Share Snapshot target changed after preview.",
      };
    }
    if (preview.status === "same") {
      this.consume(stored);
      return { status: "noop", reason: "same", previewId: preview.previewId };
    }
    if (!stored.plan) {
      this.consume(stored);
      return {
        status: "stale",
        previewId: preview.previewId,
        message: "Share Snapshot preview has no canonical write plan.",
      };
    }

    stored.lifecycle = "confirming";
    try {
      const receipt = await this.dependencies.writer.execute({
        plan: stored.plan,
        expectedBaseline: stored.baseline,
      });
      this.consume(stored);
      if (receipt.status === "stale") {
        return {
          status: "stale",
          previewId: preview.previewId,
          message: "Share Snapshot target changed before canonical write.",
        };
      }
      return {
        status: "success",
        mode: preview.status,
        previewId: preview.previewId,
        receipt,
      };
    } catch {
      this.consume(stored);
      return {
        status: "write-failed",
        previewId: preview.previewId,
        message: "Share Snapshot canonical write failed.",
      };
    }
  }

  private allocatePreviewId(): string {
    const previewId = this.dependencies.createPreviewId().trim();
    if (!previewId) {
      throw new Error("Share Snapshot preview id is required.");
    }
    if (this.previews.has(previewId)) {
      throw new Error(`Share Snapshot preview id ${previewId} already exists.`);
    }
    return previewId;
  }

  private storeTerminalPreview(
    preview: ShareSnapshotPreview,
  ): ShareSnapshotPreview {
    this.previews.set(preview.previewId, {
      preview,
      lifecycle: "ready",
    });
    return preview;
  }

  private consume(stored: InternalPreview): void {
    stored.lifecycle = "consumed";
    stored.plan = undefined;
    stored.baseline = undefined;
  }

  private async captureBaseline(input: {
    kind: ShareSnapshotBaselineKind;
    conversationId: string;
    sourceId?: string;
    identity: ChatGPTShareIdentity;
  }): Promise<ShareSnapshotBaseline> {
    const matchingSourceIds = this.storages.sources
      .getAll()
      .filter((source) => sourceMatchesShareIdentity(source, input.identity))
      .map((source) => source.id);
    const historySources = this.storages.sources
      .getAll()
      .filter((source) => sourceMatchesShareIdentity(source, input.identity));
    const conversation =
      this.storages.conversations.getById(input.conversationId);
    const source = input.sourceId
      ? this.storages.sources
          .getAll()
          .find((candidate) => candidate.id === input.sourceId) ?? null
      : null;
    return buildShareSnapshotBaseline({
      ...input,
      conversation,
      source,
      historySources,
      messages: conversation
        ? this.storages.messages.getByConversationId(input.conversationId)
        : [],
      rounds: conversation
        ? this.storages.rounds.getByConversationId(input.conversationId)
        : [],
      matchingSourceIds,
    });
  }
}
