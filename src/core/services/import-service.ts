import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";
import type { SourceStorage } from "@/core/contracts/source-storage";
import type { ConversationSourceType } from "@/core/entities/conversation";
import type { ConversationParserId, ImportPreview } from "@/core/entities/import-parser";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";

export type ConfirmImportInput = {
  title?: string;
  workspaceId?: string;
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

    this.conversations.save({
      id: conversationId,
      title: input.title?.trim() || preview.suggestedTitle,
      sourceType: sourceTypeByParser[preview.parserId],
      workspaceId: input.workspaceId,
      importProfileId: `${preview.parserId}@${preview.parserVersion}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
    });
    this.sources.save({
      id: crypto.randomUUID(),
      conversationId,
      kind: "text",
      name: preview.artifact.name,
      content: preview.artifact.content,
      importedAt: timestamp,
      updatedAt: timestamp,
    });
    this.messages.saveMany(canonicalMessages);
    this.rounds.saveMany(canonicalRounds);

    return {
      conversationId,
      messageCount: canonicalMessages.length,
      roundCount: canonicalRounds.length,
      parserId: preview.parserId,
      parserVersion: preview.parserVersion,
    };
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

    this.sources.save({
      id: crypto.randomUUID(),
      conversationId,
      kind: "text",
      name: preview.artifact.name,
      content: preview.artifact.content,
      importedAt: timestamp,
      updatedAt: timestamp,
    });
    this.messages.saveMany(appendedMessages);
    this.rounds.saveMany(appendedRounds);
    this.conversations.save({
      ...conversation,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
    });

    return {
      conversationId,
      messageCount: appendedMessages.length,
      roundCount: appendedRounds.length,
      parserId: preview.parserId,
      parserVersion: preview.parserVersion,
    };
  }
}
