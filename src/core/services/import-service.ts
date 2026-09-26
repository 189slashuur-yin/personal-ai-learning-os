import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";
import type { SourceStorage } from "@/core/contracts/source-storage";
import type {
  Conversation,
  ConversationSourceType,
} from "@/core/entities/conversation";
import type { ConversationParserId, ImportPreview } from "@/core/entities/import-parser";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { executeShareSnapshotTranscriptMutation } from "@/core/services/share-snapshot-mutation-guard";

export type ConfirmImportInput = {
  title?: string;
  workspaceId?: string;
  external?: Pick<
    Conversation,
    | "externalSource"
    | "externalConversationId"
    | "importedAt"
    | "lastExternalUpdateTime"
  >;
  messageMetadata?: Array<
    Pick<Message, "externalMessageId" | "contentHash">
  >;
};

const sourceTypeByParser: Record<ConversationParserId, ConversationSourceType> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  markdown: "Markdown",
  txt: "TXT",
  manual: "Manual",
};

export class ImportService {
  constructor(
    private readonly conversations: ConversationStorage,
    private readonly sources: SourceStorage,
    private readonly messages: MessageStorage,
    private readonly rounds: RoundStorage,
  ) {}

  confirm(preview: ImportPreview, input: ConfirmImportInput = {}) {
    if (!preview.canConfirm || preview.errors.length > 0) {
      throw new Error("Import preview contains errors and cannot be confirmed.");
    }

    const timestamp = new Date().toISOString();
    const conversationId = crypto.randomUUID();
    const canonicalMessages: Message[] = preview.messages.map((message, order) => ({
      id: crypto.randomUUID(),
      conversationId,
      role: message.role,
      content: message.content,
      order,
      createdAt: timestamp,
      updatedAt: timestamp,
      externalMessageId: input.messageMetadata?.[order]?.externalMessageId,
      contentHash: input.messageMetadata?.[order]?.contentHash,
    }));
    const canonicalRounds: Round[] = preview.rounds.map((round) => ({
      id: crypto.randomUUID(),
      conversationId,
      order: round.order,
      title: round.title,
      question: round.question,
      answer: round.answer,
      messageIds: round.messageIndexes.map((index) => canonicalMessages[index].id),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    const conversation = {
      id: conversationId,
      title: input.title?.trim() || preview.suggestedTitle,
      sourceType: sourceTypeByParser[preview.parserId],
      workspaceId: input.workspaceId,
      importProfileId: `${preview.parserId}@${preview.parserVersion}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
      ...input.external,
    } satisfies Conversation;
    const sourceId = crypto.randomUUID();
    const source = {
      id: sourceId,
      conversationId,
      kind: "text",
      name: preview.artifact.name,
      content: preview.artifact.content,
      importedAt: timestamp,
      updatedAt: timestamp,
    } as const;

    const mutation = executeShareSnapshotTranscriptMutation(
      this.sources,
      {
        conversationIds: [conversationId],
        operation: "create imported Conversation transcript",
        expected: {
          conversations: [],
          sources: [],
          messages: [],
          rounds: [],
        },
        put: {
          conversations: [conversation],
          sources: [source],
          messages: canonicalMessages,
          rounds: canonicalRounds,
        },
      },
      () => {
        this.conversations.save(conversation);
        this.sources.save(source);
        this.messages.saveMany(canonicalMessages);
        this.rounds.saveMany(canonicalRounds);
      },
    );
    const result = {
      conversationId,
      messageCount: canonicalMessages.length,
      roundCount: canonicalRounds.length,
      parserId: preview.parserId,
      parserVersion: preview.parserVersion,
      sourceId,
      messageIds: canonicalMessages.map((message) => message.id),
      roundIds: canonicalRounds.map((round) => round.id),
      skippedCount: 0,
    };
    const complete = () => {
      this.sources.saveCurrent(source);
      return result;
    };
    return mutation instanceof Promise ? mutation.then(complete) : complete();
  }

  appendToConversation(preview: ImportPreview, conversationId: string) {
    if (!preview.canConfirm || preview.errors.length > 0) {
      throw new Error("Import preview contains errors and cannot be appended.");
    }

    const conversation = this.conversations.getById(conversationId);
    if (!conversation) {
      throw new Error("Target conversation not found.");
    }

    const timestamp = new Date().toISOString();
    const existingMessages = this.messages.getByConversationId(conversationId);
    const startOrder =
      existingMessages.reduce((max, message) => Math.max(max, message.order), -1) + 1;
    const appendedMessages: Message[] = preview.messages.map((message, index) => ({
      id: crypto.randomUUID(),
      conversationId,
      role: message.role,
      content: message.content,
      order: startOrder + index,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    const messageIds = appendedMessages.map((message) => message.id);
    const existingRounds = this.rounds.getByConversationId(conversationId);
    const existingSources = this.sources
      .getAll()
      .filter((source) => source.conversationId === conversationId);
    const startRoundOrder =
      existingRounds.reduce((max, round) => Math.max(max, round.order), 0) + 1;
    const appendedRounds: Round[] = preview.rounds.map((round, index) => ({
      id: crypto.randomUUID(),
      conversationId,
      order: startRoundOrder + index,
      title: round.title,
      question: round.question,
      answer: round.answer,
      messageIds: round.messageIndexes.map((messageIndex) => messageIds[messageIndex]),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    const sourceId = crypto.randomUUID();
    const appendedSource = {
      id: sourceId,
      conversationId,
      kind: "text",
      name: preview.artifact.name,
      content: preview.artifact.content,
      importedAt: timestamp,
      updatedAt: timestamp,
    } as const;
    const updatedConversation = {
      ...conversation,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
    };
    const mutation = executeShareSnapshotTranscriptMutation(
      this.sources,
      {
        conversationIds: [conversationId],
        operation: "append imported transcript",
        expected: {
          conversations: [conversation],
          sources: existingSources,
          messages: existingMessages,
          rounds: existingRounds,
        },
        put: {
          conversations: [updatedConversation],
          sources: [appendedSource],
          messages: appendedMessages,
          rounds: appendedRounds,
        },
      },
      () => {
        this.sources.save(appendedSource);
        this.messages.saveMany(appendedMessages);
        this.rounds.saveMany(appendedRounds);
        this.conversations.save(updatedConversation);
      },
    );
    const result = {
      conversationId,
      messageCount: appendedMessages.length,
      roundCount: appendedRounds.length,
      parserId: preview.parserId,
      parserVersion: preview.parserVersion,
      sourceId,
      messageIds: appendedMessages.map((message) => message.id),
      roundIds: appendedRounds.map((round) => round.id),
      skippedCount: 0,
    };
    const complete = () => {
      this.sources.saveCurrent(appendedSource);
      return result;
    };
    return mutation instanceof Promise ? mutation.then(complete) : complete();
  }
}
