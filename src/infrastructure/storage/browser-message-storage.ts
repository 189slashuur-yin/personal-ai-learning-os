import type { MessageStorage } from "@/core/contracts/message-storage";
import type { Message } from "@/core/entities/message";

const MESSAGES_KEY = "ai-learning-os.messages";

export class BrowserMessageStorage implements MessageStorage {
  save(message: Message) {
    const messages = this.getAll();
    const existingIndex = messages.findIndex(
      (storedMessage) => storedMessage.id === message.id,
    );

    if (existingIndex >= 0) {
      messages[existingIndex] = message;
    } else {
      messages.push(message);
    }

    this.persist(messages);
  }

  saveMany(messages: Message[]) {
    const nextMessages = this.getAll();

    messages.forEach((message) => {
      const existingIndex = nextMessages.findIndex(
        (storedMessage) => storedMessage.id === message.id,
      );

      if (existingIndex >= 0) {
        nextMessages[existingIndex] = message;
      } else {
        nextMessages.push(message);
      }
    });

    this.persist(nextMessages);
  }

  getAll() {
    const storedMessages = window.localStorage.getItem(MESSAGES_KEY);

    if (!storedMessages) {
      return [];
    }

    return (JSON.parse(storedMessages) as Message[]).map((message) => ({
      ...message,
      updatedAt: message.updatedAt ?? message.createdAt,
    }));
  }

  getByConversationId(conversationId: string) {
    return this.getAll()
      .filter((message) => message.conversationId === conversationId)
      .sort(
        (left, right) =>
          left.order - right.order ||
          left.createdAt.localeCompare(right.createdAt),
      );
  }

  removeByConversationId(conversationId: string) {
    this.persist(
      this.getAll().filter(
        (message) => message.conversationId !== conversationId,
      ),
    );
  }

  replaceByConversationId(conversationId: string, messages: Message[]) {
    const otherMessages = this.getAll().filter(
      (message) => message.conversationId !== conversationId,
    );
    const conversationMessages = messages.filter(
      (message) => message.conversationId === conversationId,
    );

    this.persist([...otherMessages, ...conversationMessages]);
  }

  private persist(messages: Message[]) {
    window.localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  }
}
