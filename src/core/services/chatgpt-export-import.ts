import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";
import type { SourceStorage } from "@/core/contracts/source-storage";
import type { Message, MessageRole } from "@/core/entities/message";
import type { ImportPreview, ParsedMessageDraft } from "@/core/entities/import-parser";
import { deriveRoundDrafts } from "@/core/services/import-parser-pipeline";
import { ImportService } from "@/core/services/import-service";
import { RoundService } from "@/core/services/round-service";

type ChatGPTNode = {
  id?: string;
  parent?: string | null;
  message?: {
    id?: string;
    author?: { role?: string };
    content?: { content_type?: string; parts?: unknown[] };
    create_time?: number | null;
  } | null;
};

type ChatGPTConversation = {
  id?: string;
  conversation_id?: string;
  title?: string;
  create_time?: number | null;
  update_time?: number | null;
  current_node?: string | null;
  mapping?: Record<string, ChatGPTNode>;
};

export type ChatGPTLinearMessage = {
  externalMessageId?: string;
  role: "user" | "assistant";
  content: string;
  contentHash: string;
  createdAt?: string;
};

/** Conversations exceeding this many messages trigger a risk warning in the UI. */
export const LARGE_CONVERSATION_MESSAGE_THRESHOLD = 100;

export type ChatGPTConversationPreview = {
  externalConversationId: string;
  title: string;
  createTime?: string;
  updateTime?: string;
  messages: ChatGPTLinearMessage[];
  unsupportedCount: number;
  /** True when the conversation is considered large and may cause performance issues. */
  isLarge: boolean;
};

export type ChatGPTImportPreview = ChatGPTConversationPreview & {
  existingConversationId?: string;
  existingMessages: number;
  newMessages: number;
  skippedDuplicates: number;
  appendOnly: boolean;
};

function isoFromSeconds(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Date(value * 1000).toISOString();
}

function contentHash(role: string, content: string) {
  const input = `${role}\u0000${content.replace(/\s+/g, " ").trim()}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function branchNodes(conversation: ChatGPTConversation) {
  const mapping = conversation.mapping ?? {};
  const currentNode = conversation.current_node;
  if (currentNode && mapping[currentNode]) {
    const branch: ChatGPTNode[] = [];
    const visited = new Set<string>();
    let nodeId: string | null | undefined = currentNode;
    while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
      visited.add(nodeId);
      branch.unshift({ ...mapping[nodeId], id: mapping[nodeId].id ?? nodeId });
      nodeId = mapping[nodeId].parent;
    }
    return branch;
  }
  return Object.entries(mapping)
    .map(([key, node]) => ({ ...node, id: node.id ?? key }))
    .sort(
      (left, right) =>
        (left.message?.create_time ?? 0) - (right.message?.create_time ?? 0),
    );
}

function linearize(conversation: ChatGPTConversation) {
  let unsupportedCount = 0;
  const messages: ChatGPTLinearMessage[] = [];
  branchNodes(conversation).forEach((node) => {
    const message = node.message;
    const role = message?.author?.role;
    const contentType = message?.content?.content_type ?? "text";
    if (!message || (role !== "user" && role !== "assistant")) {
      if (message) unsupportedCount += 1;
      return;
    }
    if (contentType !== "text") {
      unsupportedCount += 1;
      return;
    }
    const parts = message.content?.parts ?? [];
    const content = parts.filter((part): part is string => typeof part === "string").join("\n").trim();
    if (!content) {
      unsupportedCount += 1;
      return;
    }
    messages.push({
      externalMessageId: message.id ?? node.id,
      role,
      content,
      contentHash: contentHash(role, content),
      createdAt: isoFromSeconds(message.create_time),
    });
  });
  return { messages, unsupportedCount };
}

/** Build an ImportPreview directly from structured ChatGPTLinearMessages,
 *  bypassing the lossy text serializer/parser round-trip. */
function buildStructuredImportPreview(
  messages: ChatGPTLinearMessage[],
  title: string,
): ImportPreview {
  const messageDrafts: ParsedMessageDraft[] = messages.map((m) => ({
    role: m.role as MessageRole,
    content: m.content,
  }));
  const rounds = deriveRoundDrafts(messageDrafts);
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  return {
    parserId: "chatgpt",
    parserVersion: "1.0.0",
    producer: "ChatGPT",
    format: "provider-transcript",
    suggestedTitle: title,
    messages: messageDrafts,
    rounds,
    warnings: [],
    errors: [],
    artifact: {
      name: "conversations.json",
      channel: "file",
      content: transcript,
      mediaType: "application/json",
    },
    messageCount: messageDrafts.length,
    roundCount: rounds.length,
    unknownMessageCount: 0,
    canConfirm: true,
  };
}

export class ChatGPTExportImportService {

  constructor(
    private readonly conversations: ConversationStorage,
    private readonly sources: SourceStorage,
    private readonly messages: MessageStorage,
    private readonly rounds: RoundStorage,
  ) {}

  parseExport(text: string): ChatGPTConversationPreview[] {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("conversations.json 顶层必须是数组。");
    return (parsed as ChatGPTConversation[]).flatMap((conversation, index) => {
      const externalConversationId = conversation.id ?? conversation.conversation_id;
      if (!externalConversationId || !conversation.mapping) return [];
      const result = linearize(conversation);
      const isLarge = result.messages.length > LARGE_CONVERSATION_MESSAGE_THRESHOLD;
      return [{
        externalConversationId,
        title: conversation.title?.trim() || `ChatGPT Conversation ${index + 1}`,
        createTime: isoFromSeconds(conversation.create_time),
        updateTime: isoFromSeconds(conversation.update_time),
        ...result,
        isLarge,
      }];
    });
  }

  previewImport(conversation: ChatGPTConversationPreview): ChatGPTImportPreview {
    const existing = this.conversations.getAll().find(
      (item) =>
        item.externalSource === "chatgpt" &&
        item.externalConversationId === conversation.externalConversationId,
    );
    const existingMessages = existing
      ? this.messages.getByConversationId(existing.id)
      : [];
    const externalIds = new Set(
      existingMessages.flatMap((message) =>
        message.externalMessageId ? [message.externalMessageId] : [],
      ),
    );
    const hashes = new Set(
      existingMessages.map(
        (message) => message.contentHash ?? contentHash(message.role, message.content),
      ),
    );
    const newMessages = conversation.messages.filter((message) => {
      const duplicate =
        message.externalMessageId && externalIds.size > 0
          ? externalIds.has(message.externalMessageId)
          : hashes.has(message.contentHash);
      return !duplicate;
    }).length;
    return {
      ...conversation,
      existingConversationId: existing?.id,
      existingMessages: existingMessages.length,
      newMessages,
      skippedDuplicates: conversation.messages.length - newMessages,
      appendOnly: Boolean(existing),
    };
  }

  previewAppendToConversation(
    conversation: ChatGPTConversationPreview,
    targetConversationId: string,
  ): { newMessages: number; skipped: number; existingTotal: number } {
    const existingMessages = this.messages.getByConversationId(targetConversationId);
    const externalIds = new Set(
      existingMessages.flatMap((m) => (m.externalMessageId ? [m.externalMessageId] : [])),
    );
    const hashes = new Set(
      existingMessages.map((m) => m.contentHash ?? contentHash(m.role, m.content)),
    );
    const newCount = conversation.messages.filter((m) => {
      if (m.externalMessageId && externalIds.has(m.externalMessageId)) return false;
      if (hashes.has(m.contentHash)) return false;
      return true;
    }).length;
    return {
      newMessages: newCount,
      skipped: conversation.messages.length - newCount,
      existingTotal: existingMessages.length,
    };
  }

  importConversation(preview: ChatGPTImportPreview, options?: { workspaceId?: string; forceNew?: boolean }) {
    const { workspaceId, forceNew } = options ?? {};
    const timestamp = new Date().toISOString();

    // P0-E: In new mode, skip conversations whose externalConversationId already exists.
    if (forceNew && preview.existingConversationId) {
      return {
        conversationId: preview.existingConversationId,
        appended: 0,
        skipped: preview.messages.length,
        roundsCreated: 0,
        skippedDuplicateConversation: true,
        duplicateOfTitle: preview.title,
      };
    }

    if (forceNew || !preview.existingConversationId) {
      const importPreview = buildStructuredImportPreview(preview.messages, preview.title);
      const result = new ImportService(
        this.conversations,
        this.sources,
        this.messages,
        this.rounds,
      ).confirm(importPreview, { title: preview.title, workspaceId });
      const conversation = this.conversations.getById(result.conversationId);
      if (!conversation) throw new Error("Imported Conversation is unavailable.");
      this.conversations.save({
        ...conversation,
        externalSource: "chatgpt",
        externalConversationId: preview.externalConversationId,
        importedAt: timestamp,
        lastExternalUpdateTime: preview.updateTime,
      });
      const storedMessages = this.messages.getByConversationId(result.conversationId);
      this.messages.saveMany(
        storedMessages.map((message, index) => ({
          ...message,
          externalMessageId: preview.messages[index]?.externalMessageId,
          contentHash:
            preview.messages[index]?.contentHash ??
            contentHash(message.role, message.content),
        })),
      );
      return { conversationId: result.conversationId, appended: storedMessages.length, skipped: 0, roundsCreated: result.roundCount };
    }

    const existing = this.conversations.getById(preview.existingConversationId);
    if (!existing) throw new Error("Existing Conversation is unavailable.");
    const storedMessages = this.messages.getByConversationId(existing.id);
    const externalIds = new Set(storedMessages.flatMap((message) => message.externalMessageId ? [message.externalMessageId] : []));
    const hashes = new Set(storedMessages.map((message) => message.contentHash ?? contentHash(message.role, message.content)));
    const additions = preview.messages.filter((message) => {
      const duplicate =
        message.externalMessageId && externalIds.size > 0
          ? externalIds.has(message.externalMessageId)
          : hashes.has(message.contentHash);
      return !duplicate;
    });
    const startOrder = storedMessages.reduce((max, message) => Math.max(max, message.order), -1) + 1;
    const newMessages: Message[] = additions.map((message, index) => ({
      id: crypto.randomUUID(),
      conversationId: existing.id,
      role: message.role as MessageRole,
      content: message.content,
      order: startOrder + index,
      createdAt: message.createdAt ?? timestamp,
      updatedAt: timestamp,
      externalMessageId: message.externalMessageId,
      contentHash: message.contentHash,
    }));
    this.messages.saveMany(newMessages);
    this.conversations.save({
      ...existing,
      externalSource: "chatgpt",
      externalConversationId: preview.externalConversationId,
      importedAt: existing.importedAt ?? timestamp,
      lastExternalUpdateTime: preview.updateTime,
      updatedAt: newMessages.length ? timestamp : existing.updatedAt,
    });

    // Generate rounds for appended messages using structured derivation (no text round-trip)
    const appendImportPreview = buildStructuredImportPreview(additions, preview.title);
    const roundService = new RoundService(this.rounds);
    let roundsCreated = 0;
    for (const round of appendImportPreview.rounds) {
      const mappedIds = round.messageIndexes
        .map((idx: number) => newMessages[idx]?.id)
        .filter(Boolean) as string[];
      if (mappedIds.length > 0) {
        roundService.createRound({
          conversationId: existing.id,
          title: round.title,
          question: round.question,
          answer: round.answer,
          messageIds: mappedIds,
        });
        roundsCreated += 1;
      }
    }
    return { conversationId: existing.id, appended: newMessages.length, skipped: preview.messages.length - newMessages.length, roundsCreated };
  }

  appendToConversation(
    preview: ChatGPTConversationPreview,
    targetConversationId: string,
  ): { conversationId: string; appendedMessages: number; appendedRounds: number; skipped: number; unsupported: number; skippedExistingSource?: boolean } {
    const timestamp = new Date().toISOString();
    const target = this.conversations.getById(targetConversationId);
    if (!target) throw new Error("Target conversation not found.");

    const existingMessages = this.messages.getByConversationId(targetConversationId);

    // P0-E: Source-level dedup — check if this ChatGPT source has already been
    // appended to the target by looking for any matching externalMessageId.
    // When a source was previously appended, ALL of its messages' externalMessageIds
    // are stored on the target's messages.  If ANY intersect, the entire source is
    // skipped so we never partially re-append old conversations.
    const sourceExternalIds = new Set(
      preview.messages
        .filter((m) => m.externalMessageId)
        .map((m) => m.externalMessageId!),
    );
    const alreadyAppended =
      sourceExternalIds.size > 0 &&
      existingMessages.some(
        (m) => m.externalMessageId && sourceExternalIds.has(m.externalMessageId),
      );

    if (alreadyAppended) {
      return {
        conversationId: target.id,
        appendedMessages: 0,
        appendedRounds: 0,
        skipped: preview.messages.length,
        unsupported: preview.unsupportedCount,
        skippedExistingSource: true,
      };
    }

    const existingExternalIds = new Set(
      existingMessages.flatMap((m) => (m.externalMessageId ? [m.externalMessageId] : [])),
    );
    const existingHashes = new Set(
      existingMessages.map((m) => m.contentHash ?? contentHash(m.role, m.content)),
    );

    const additions = preview.messages.filter((m) => {
      if (m.externalMessageId && existingExternalIds.has(m.externalMessageId)) return false;
      if (existingHashes.has(m.contentHash)) return false;
      return true;
    });

    const skipped = preview.messages.length - additions.length;
    if (additions.length === 0) {
      return {
        conversationId: target.id,
        appendedMessages: 0,
        appendedRounds: 0,
        skipped,
        unsupported: preview.unsupportedCount,
      };
    }

    const startOrder =
      existingMessages.reduce((max, m) => Math.max(max, m.order), -1) + 1;
    const newMessages: Message[] = additions.map((m, i) => ({
      id: crypto.randomUUID(),
      conversationId: target.id,
      role: m.role as MessageRole,
      content: m.content,
      order: startOrder + i,
      createdAt: m.createdAt ?? timestamp,
      updatedAt: timestamp,
      externalMessageId: m.externalMessageId,
      contentHash: m.contentHash,
    }));
    this.messages.saveMany(newMessages);

    // Verify messages are readable after save
    const savedMessageIds = new Set(
      this.messages
        .getByConversationId(target.id)
        .map((m) => m.id),
    );
    const unreadableMessages = newMessages.filter(
      (m) => !savedMessageIds.has(m.id),
    );
    if (unreadableMessages.length > 0) {
      throw new Error(
        `appendToConversation: ${unreadableMessages.length} messages not readable after saveMany for conversation ${target.id}`,
      );
    }

    const appendImportPreview = buildStructuredImportPreview(additions, preview.title);

    const roundService = new RoundService(this.rounds);
    let appendedRounds = 0;
    const createdRoundIds: string[] = [];
    for (const round of appendImportPreview.rounds) {
      const mappedIds = round.messageIndexes
        .map((idx: number) => newMessages[idx]?.id)
        .filter(Boolean) as string[];
      if (mappedIds.length > 0) {
        const created = roundService.createRound({
          conversationId: target.id,
          title: round.title,
          question: round.question,
          answer: round.answer,
          messageIds: mappedIds,
        });
        createdRoundIds.push(created.id);
        appendedRounds += 1;
      }
    }

    // Verify rounds are readable after creation
    if (appendedRounds > 0) {
      const readableRoundIds = new Set(
        this.rounds.getByConversationId(target.id).map((r) => r.id),
      );
      const missingRounds = createdRoundIds.filter(
        (id) => !readableRoundIds.has(id),
      );
      if (missingRounds.length > 0) {
        throw new Error(
          `appendToConversation: ${missingRounds.length} rounds not readable after creation for conversation ${target.id}`,
        );
      }
    }

    this.conversations.save({
      ...target,
      importedAt: target.importedAt ?? timestamp,
      updatedAt: timestamp,
    });

    return {
      conversationId: target.id,
      appendedMessages: additions.length,
      appendedRounds,
      skipped,
      unsupported: preview.unsupportedCount,
    };
  }
}
