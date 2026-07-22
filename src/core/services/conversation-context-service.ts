import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import {
  conversationContextFields,
  type Conversation,
  type ConversationContext,
  type ConversationContextField,
} from "@/core/entities/conversation";
import type {
  ConversationContextChange,
  ConversationVersion,
} from "@/core/entities/conversation-version";
import { ConversationVersionService } from "@/core/services/conversation-version-service";

export const conversationContextLabels: Record<
  ConversationContextField,
  string
> = {
  longTermBackground: "长期背景",
  currentState: "当前状态",
  decisions: "决策记录",
  constraints: "约束条件",
  nextActions: "下一步行动",
};

export type ConversationContextStorages = {
  conversations: ConversationStorage;
  messages: MessageStorage;
  versions: ConversationVersionStorage;
};

export type ConversationContextUpdate = {
  conversation: Conversation;
  version: ConversationVersion;
  changes: ConversationContextChange[];
};

export function normalizeConversationContext(
  context?: ConversationContext,
): ConversationContext {
  return Object.fromEntries(
    conversationContextFields.flatMap((field) => {
      const value = context?.[field]?.trim();
      return value ? [[field, value]] : [];
    }),
  ) as ConversationContext;
}

export function hasConversationContext(context?: ConversationContext) {
  return Object.keys(normalizeConversationContext(context)).length > 0;
}

export function getConversationOverviewContext(
  conversation: Conversation,
): ConversationContext {
  return normalizeConversationContext(conversation.context);
}

function contextChanges(
  previous: ConversationContext,
  next: ConversationContext,
): ConversationContextChange[] {
  return conversationContextFields.flatMap((field) => {
    const previousValue = previous[field];
    const nextValue = next[field];

    return previousValue === nextValue
      ? []
      : [{ field, previousValue, nextValue }];
  });
}

export class ConversationContextService {
  constructor(private readonly storages: ConversationContextStorages) {}

  getContext(conversationId: string): ConversationContext | null {
    const conversation = this.storages.conversations.getById(conversationId);
    return conversation
      ? normalizeConversationContext(conversation.context)
      : null;
  }

  updateContext(
    conversationId: string,
    input: ConversationContext,
  ): ConversationContextUpdate | null {
    const conversation = this.storages.conversations.getById(conversationId);

    if (!conversation) {
      return null;
    }

    const previous = normalizeConversationContext(conversation.context);
    const next = normalizeConversationContext(input);
    const changes = contextChanges(previous, next);

    if (changes.length === 0) {
      return null;
    }

    const timestamp = new Date().toISOString();
    const nextConversation: Conversation = {
      ...conversation,
      context: hasConversationContext(next) ? next : undefined,
      updatedAt: timestamp,
    };
    this.storages.conversations.save(nextConversation);

    const changedLabels = changes
      .map((change) => conversationContextLabels[change.field])
      .join("、");
    const version = new ConversationVersionService(this.storages).createSnapshot(
      conversationId,
      `Context 更新 · ${changedLabels}`,
      "人工确认 Conversation Context 后自动记录。历史快照不会被覆盖。",
      { kind: "context", contextChanges: changes },
    );

    if (!version) {
      return null;
    }

    return { conversation: nextConversation, version, changes };
  }

  clearContext(conversationId: string) {
    return this.updateContext(conversationId, {});
  }

  getTimeline(conversationId: string) {
    return this.storages.versions
      .getByConversationId(conversationId)
      .filter(
        (version) =>
          version.kind === "context" &&
          Boolean(version.contextChanges?.length),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
