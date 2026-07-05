import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";
import type { SourceStorage } from "@/core/contracts/source-storage";
import type { Message, MessageRole } from "@/core/entities/message";
import { ImportParserPipeline } from "@/core/services/import-parser-pipeline";
import { ImportService } from "@/core/services/import-service";

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

export type ChatGPTConversationPreview = {
  externalConversationId: string;
  title: string;
  createTime?: string;
  updateTime?: string;
  messages: ChatGPTLinearMessage[];
  unsupportedCount: number;
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

export class ChatGPTExportImportService {
  private readonly pipeline = new ImportParserPipeline();

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
      return [{
        externalConversationId,
        title: conversation.title?.trim() || `ChatGPT Conversation ${index + 1}`,
        createTime: isoFromSeconds(conversation.create_time),
        updateTime: isoFromSeconds(conversation.update_time),
        ...result,
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

  importConversation(preview: ChatGPTImportPreview, workspaceId?: string) {
    const timestamp = new Date().toISOString();
    if (!preview.existingConversationId) {
      const transcript = preview.messages
        .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
        .join("\n\n");
      const parserPreview = this.pipeline.preview(
        {
          name: "conversations.json",
          channel: "file",
          content: transcript,
          mediaType: "application/json",
        },
        "chatgpt",
      );
      const result = new ImportService(
        this.conversations,
        this.sources,
        this.messages,
        this.rounds,
      ).confirm(parserPreview, { title: preview.title, workspaceId });
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
    return { conversationId: existing.id, appended: newMessages.length, skipped: preview.messages.length - newMessages.length, roundsCreated: 0 };
  }
}
