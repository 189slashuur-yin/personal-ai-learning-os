import type { MessageStorage } from "@/core/contracts/message-storage";
import type { Message } from "@/core/entities/message";
import { getMessageCache, setMessageCache } from "./preload";
import {
  deleteWhere,
  persistInBackground,
  replaceWhere,
  writeMany,
  writeOne,
} from "./database";

export function normalizeIndexedDBMessage(message: Message): Message {
  return {
    ...message,
    updatedAt: message.updatedAt ?? message.createdAt,
    externalMessageId: message.externalMessageId?.trim() || undefined,
    contentHash: message.contentHash?.trim() || undefined,
  };
}

export class IndexedDBMessageStorage implements MessageStorage {
  save(message: Message): void {
    const normalized = normalizeIndexedDBMessage(message);
    const cache = getMessageCache();
    const idx = cache.findIndex((m) => m.id === normalized.id);
    if (idx >= 0) cache[idx] = normalized;
    else cache.push(normalized);
    persistInBackground("save message", writeOne("messages", normalized));
  }

  saveMany(messages: Message[]): void {
    const cache = getMessageCache();
    for (const msg of messages) {
      const norm = normalizeIndexedDBMessage(msg);
      const idx = cache.findIndex((m) => m.id === norm.id);
      if (idx >= 0) cache[idx] = norm;
      else cache.push(norm);
    }
    persistInBackground(
      "save many messages",
      writeMany("messages", messages.map(normalizeIndexedDBMessage)),
    );
  }

  getAll(): Message[] {
    return getMessageCache().map(normalizeIndexedDBMessage);
  }

  getByConversationId(conversationId: string): Message[] {
    return this.getAll()
      .filter((m) => m.conversationId === conversationId)
      .sort(
        (left, right) =>
          left.order - right.order ||
          left.createdAt.localeCompare(right.createdAt),
      );
  }

  removeByConversationId(conversationId: string): void {
    const cache = getMessageCache();
    setMessageCache(cache.filter((m) => m.conversationId !== conversationId));
    persistInBackground(
      "remove messages by conversation",
      deleteWhere<Message>(
        "messages",
        (message) => message.conversationId === conversationId,
      ),
    );
  }

  replaceByConversationId(conversationId: string, messages: Message[]): void {
    const other = getMessageCache().filter((m) => m.conversationId !== conversationId);
    const convMsgs = messages
      .filter((m) => m.conversationId === conversationId)
      .map(normalizeIndexedDBMessage);
    const all = [...other, ...convMsgs];
    setMessageCache(all);
    persistInBackground(
      "replace messages by conversation",
      replaceWhere<Message>(
        "messages",
        (message) => message.conversationId === conversationId,
        convMsgs,
      ),
    );
  }
}
