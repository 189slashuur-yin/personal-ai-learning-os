import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";

export type RoundMigrationStatus = "ready" | "noop" | "blocked";

export type RoundMigrationSummary = {
  status: RoundMigrationStatus;
  conversationCount: number;
  messageCount: number;
  existingRoundCount: number;
  plannedRoundCount: number;
  roundsToCreateCount: number;
  coveredMessageCount: number;
  warnings: string[];
  errors: string[];
};

export type RoundMigrationPreview = {
  migrationVersion: "message-to-round-v1";
  plannedRounds: Round[];
  roundsToCreate: Round[];
  summary: RoundMigrationSummary;
};

type RoundDraft = {
  messages: Message[];
  kind: "answered" | "unanswered" | "orphan-assistant" | "context";
};

function sortMessages(messages: Message[]) {
  return [...messages].sort(
    (left, right) =>
      left.order - right.order ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function joinMessages(messages: Message[], roles: Message["role"][]) {
  return messages
    .filter((message) => roles.includes(message.role))
    .map((message) => message.content)
    .filter(Boolean)
    .join("\n\n");
}

function latestTimestamp(messages: Message[]) {
  return messages.reduce(
    (latest, message) => {
      const candidate = message.updatedAt ?? message.createdAt;
      return candidate.localeCompare(latest) > 0 ? candidate : latest;
    },
    messages[0].updatedAt ?? messages[0].createdAt,
  );
}

function deriveDrafts(messages: Message[]): RoundDraft[] {
  const drafts: RoundDraft[] = [];
  let current: RoundDraft | null = null;

  const finish = () => {
    if (current) drafts.push(current);
    current = null;
  };

  sortMessages(messages).forEach((message) => {
    if (message.role === "user" || message.role === "unknown") {
      finish();
      current = { messages: [message], kind: "unanswered" };
      return;
    }

    if (message.role === "assistant") {
      if (!current || current.kind === "context") {
        finish();
        current = { messages: [message], kind: "orphan-assistant" };
      } else {
        current.messages.push(message);
        if (current.kind === "unanswered") current.kind = "answered";
      }
      return;
    }

    if (!current || current.kind !== "context") {
      finish();
      current = { messages: [message], kind: "context" };
    } else {
      current.messages.push(message);
    }
  });

  finish();
  return drafts;
}

function createRound(conversationId: string, draft: RoundDraft, order: number): Round {
  const firstMessage = draft.messages[0];
  const question =
    draft.kind === "context"
      ? joinMessages(draft.messages, ["system"])
      : joinMessages(draft.messages, ["user", "unknown"]);
  const answer = joinMessages(draft.messages, ["assistant"]);

  return {
    id: `round-v1-${firstMessage.id}`,
    conversationId,
    order,
    title:
      question.split("\n")[0].slice(0, 80) ||
      (draft.kind === "context" ? `Context ${order}` : `Round ${order}`),
    question,
    answer,
    messageIds: draft.messages.map((message) => message.id),
    createdAt: firstMessage.createdAt,
    updatedAt: latestTimestamp(draft.messages),
  };
}

function sameMembership(left: Round, right: Round) {
  return (
    left.conversationId === right.conversationId &&
    left.messageIds.length === right.messageIds.length &&
    left.messageIds.every((messageId, index) => messageId === right.messageIds[index])
  );
}

export class MessageToRoundMigrationService {
  constructor(
    private readonly conversations: ConversationStorage,
    private readonly messages: MessageStorage,
    private readonly rounds: RoundStorage,
  ) {}

  preview(): RoundMigrationPreview {
    const conversations = this.conversations.getAll();
    const allMessages = this.messages.getAll();
    const existingRounds = this.rounds.getAll();
    const existingById = new Map(existingRounds.map((round) => [round.id, round]));
    const warnings: string[] = [];
    const errors: string[] = [];
    const plannedRounds = conversations.flatMap((conversation) =>
      deriveDrafts(
        allMessages.filter((message) => message.conversationId === conversation.id),
      ).map((draft, index) => createRound(conversation.id, draft, index + 1)),
    );

    const conversationIds = new Set(conversations.map((conversation) => conversation.id));
    const orphanMessages = allMessages.filter(
      (message) => !conversationIds.has(message.conversationId),
    );
    if (orphanMessages.length > 0) {
      warnings.push(
        `${orphanMessages.length} Message record(s) reference a missing Conversation and were not migrated.`,
      );
    }

    plannedRounds.forEach((plannedRound) => {
      const existingRound = existingById.get(plannedRound.id);
      if (existingRound && !sameMembership(existingRound, plannedRound)) {
        errors.push(
          `Round ID collision for ${plannedRound.id}; existing membership was left unchanged.`,
        );
      }
    });

    const roundsToCreate = plannedRounds.filter(
      (plannedRound) => !existingById.has(plannedRound.id),
    );
    const coveredMessageCount = new Set(
      plannedRounds.flatMap((round) => round.messageIds),
    ).size;
    const status: RoundMigrationStatus =
      errors.length > 0 ? "blocked" : roundsToCreate.length > 0 ? "ready" : "noop";

    return {
      migrationVersion: "message-to-round-v1",
      plannedRounds,
      roundsToCreate,
      summary: {
        status,
        conversationCount: conversations.length,
        messageCount: allMessages.length,
        existingRoundCount: existingRounds.length,
        plannedRoundCount: plannedRounds.length,
        roundsToCreateCount: roundsToCreate.length,
        coveredMessageCount,
        warnings,
        errors,
      },
    };
  }

  previewConversation(conversationId: string): RoundMigrationPreview {
    const conversation = this.conversations.getById(conversationId);
    const messages = this.messages.getByConversationId(conversationId);
    const existingRounds = this.rounds.getByConversationId(conversationId);
    const existingById = new Map(existingRounds.map((round) => [round.id, round]));
    const errors: string[] = [];
    const plannedRounds = conversation
      ? deriveDrafts(messages).map((draft, index) =>
          createRound(conversationId, draft, index + 1),
        )
      : [];
    if (!conversation) errors.push(`Conversation ${conversationId} does not exist.`);
    plannedRounds.forEach((plannedRound) => {
      const existing = existingById.get(plannedRound.id);
      if (existing && !sameMembership(existing, plannedRound)) {
        errors.push(`Round ID collision for ${plannedRound.id}.`);
      }
    });
    const roundsToCreate = plannedRounds.filter((round) => !existingById.has(round.id));
    return {
      migrationVersion: "message-to-round-v1",
      plannedRounds,
      roundsToCreate,
      summary: {
        status: errors.length ? "blocked" : roundsToCreate.length ? "ready" : "noop",
        conversationCount: conversation ? 1 : 0,
        messageCount: messages.length,
        existingRoundCount: existingRounds.length,
        plannedRoundCount: plannedRounds.length,
        roundsToCreateCount: roundsToCreate.length,
        coveredMessageCount: new Set(plannedRounds.flatMap((round) => round.messageIds)).size,
        warnings: [],
        errors,
      },
    };
  }

  applyConversation(preview: RoundMigrationPreview) {
    const conversationId = preview.plannedRounds[0]?.conversationId;
    if (!conversationId || preview.summary.status === "blocked") {
      throw new Error("Conversation migration preview cannot be applied.");
    }
    const current = this.previewConversation(conversationId);
    if (
      current.summary.status === "blocked" ||
      current.roundsToCreate.map((round) => round.id).join("|") !==
        preview.roundsToCreate.map((round) => round.id).join("|")
    ) {
      throw new Error("Conversation migration input changed; preview again.");
    }
    this.rounds.saveMany(current.roundsToCreate);
    return current.summary;
  }

  apply(preview: RoundMigrationPreview) {
    if (preview.migrationVersion !== "message-to-round-v1") {
      throw new Error("Unsupported Message-to-Round migration version.");
    }

    if (preview.summary.status === "blocked") {
      throw new Error("Blocked Message-to-Round migration cannot be applied.");
    }

    const currentPreview = this.preview();
    const currentIds = currentPreview.roundsToCreate.map((round) => round.id).join("|");
    const previewIds = preview.roundsToCreate.map((round) => round.id).join("|");

    if (currentPreview.summary.status === "blocked" || currentIds !== previewIds) {
      throw new Error("Migration input changed after preview; run preview again.");
    }

    this.rounds.saveMany(currentPreview.roundsToCreate);
    return {
      ...currentPreview.summary,
      status: "noop" as const,
      existingRoundCount:
        currentPreview.summary.existingRoundCount +
        currentPreview.summary.roundsToCreateCount,
      roundsToCreateCount: 0,
    };
  }
}
