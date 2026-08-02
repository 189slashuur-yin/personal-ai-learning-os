import type {
  ConversationVersionRestoreCommand,
  ConversationVersionRestoreReceipt,
  ConversationVersionRestoreState,
  ConversationVersionRestoreWriter,
} from "@/core/contracts/conversation-version-restore-writer";
import type { Conversation } from "@/core/entities/conversation";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { assertShareSnapshotTranscriptMutableInSources } from "@/core/services/share-snapshot-mutation-guard";
import {
  drainPendingWritesOrThrow,
  getPendingWriteCount,
  openPalosDB,
} from "./database";
import { normalizeIndexedDBConversation } from "./idb-conversation-storage";
import { normalizeIndexedDBMessage } from "./idb-message-storage";
import { normalizeIndexedDBRound } from "./idb-round-storage";
import {
  setConversationCache,
  setMessageCache,
  setRoundCache,
} from "./preload";

type PersistedRestoreState = {
  conversations: Conversation[];
  messages: Message[];
  rounds: Round[];
};

type AuthoritativeRestoreState = PersistedRestoreState & {
  sources: ImportedSource[];
};

type ValidatedRestore = {
  after: {
    conversation: Conversation;
    messages: Message[];
    rounds: Round[];
  };
  currentMessageIds: string[];
  currentRoundIds: string[];
};

export class ConversationVersionRestoreReloadVerificationError extends Error {
  readonly committed = true;
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      "Conversation Version Restore transaction committed, but reload verification failed; no rollback was attempted.",
    );
    this.name = "ConversationVersionRestoreReloadVerificationError";
    this.cause = cause;
  }
}

function normalizeComparable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeComparable);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeComparable(entry)]),
  );
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizeComparable(left)) ===
    JSON.stringify(normalizeComparable(right))
  );
}

function assertUniqueIds(
  records: readonly Readonly<{ id: string }>[],
  label: string,
): void {
  const ids = new Set<string>();
  for (const record of records) {
    if (!record.id || ids.has(record.id)) {
      throw new Error(
        `Conversation Version Restore contains an invalid or duplicate ${label} ID.`,
      );
    }
    ids.add(record.id);
  }
}

function recordsEqualById<T extends { id: string }>(
  left: readonly T[],
  right: readonly T[],
): boolean {
  const byId = (records: readonly T[]) =>
    [...records].sort((a, b) => a.id.localeCompare(b.id));
  return valuesEqual(byId(left), byId(right));
}

function normalizeState(
  state: ConversationVersionRestoreState,
): ValidatedRestore["after"] {
  return {
    conversation: normalizeIndexedDBConversation({
      ...state.conversation,
    }),
    messages: state.messages.map((message) =>
      normalizeIndexedDBMessage({ ...message }),
    ),
    rounds: state.rounds.map((round) =>
      normalizeIndexedDBRound({
        ...round,
        messageIds: [...round.messageIds],
      }),
    ),
  };
}

function withoutMessageIds(round: Round): Omit<Round, "messageIds"> {
  return {
    id: round.id,
    conversationId: round.conversationId,
    order: round.order,
    title: round.title,
    question: round.question,
    answer: round.answer,
    note: round.note,
    summary: round.summary,
    context: round.context,
    createdAt: round.createdAt,
    updatedAt: round.updatedAt,
  };
}

function validateRestore(
  command: ConversationVersionRestoreCommand,
  persisted: AuthoritativeRestoreState,
): ValidatedRestore {
  const before = normalizeState(command.before);
  const after = normalizeState(command.after);
  const conversationId = before.conversation.id;
  if (!conversationId || after.conversation.id !== conversationId) {
    throw new Error(
      "Conversation Version Restore must preserve the Conversation ID.",
    );
  }

  assertUniqueIds(before.messages, "current Message");
  assertUniqueIds(after.messages, "restored Message");
  assertUniqueIds(before.rounds, "current Round");
  assertUniqueIds(after.rounds, "restored Round");
  assertShareSnapshotTranscriptMutableInSources(
    persisted.sources,
    conversationId,
    "restore Conversation version",
  );

  const actualConversation = persisted.conversations.find(
    ({ id }) => id === conversationId,
  );
  const actualMessages = persisted.messages
    .filter((message) => message.conversationId === conversationId)
    .map(normalizeIndexedDBMessage);
  const actualRounds = persisted.rounds
    .filter((round) => round.conversationId === conversationId)
    .map(normalizeIndexedDBRound);
  if (
    !actualConversation ||
    !valuesEqual(
      normalizeIndexedDBConversation(actualConversation),
      before.conversation,
    ) ||
    !recordsEqualById(actualMessages, before.messages) ||
    !recordsEqualById(actualRounds, before.rounds)
  ) {
    throw new Error(
      "Conversation Version Restore authoritative state changed before commit.",
    );
  }

  const currentMessageIds = new Set(before.messages.map(({ id }) => id));
  const otherMessageIds = new Set(
    persisted.messages
      .filter((message) => message.conversationId !== conversationId)
      .map(({ id }) => id),
  );
  const restoredOrders = new Set<number>();
  for (const message of after.messages) {
    if (
      message.conversationId !== conversationId ||
      currentMessageIds.has(message.id) ||
      otherMessageIds.has(message.id) ||
      restoredOrders.has(message.order)
    ) {
      throw new Error(
        "Conversation Version Restore requires new, unique Message identity and order.",
      );
    }
    restoredOrders.add(message.order);
  }

  const beforeRoundById = new Map(
    before.rounds.map((round) => [round.id, round]),
  );
  if (beforeRoundById.size !== after.rounds.length) {
    throw new Error(
      "Conversation Version Restore must preserve the existing Round set.",
    );
  }
  const restoredMessageIds = new Set(after.messages.map(({ id }) => id));
  for (const round of after.rounds) {
    const currentRound = beforeRoundById.get(round.id);
    if (
      round.conversationId !== conversationId ||
      !currentRound ||
      !valuesEqual(
        withoutMessageIds(round),
        withoutMessageIds(currentRound),
      ) ||
      round.messageIds.some((messageId) => !restoredMessageIds.has(messageId))
    ) {
      throw new Error(
        "Conversation Version Restore must preserve Round data and valid Message references.",
      );
    }
  }

  return {
    after,
    currentMessageIds: actualMessages.map(({ id }) => id),
    currentRoundIds: actualRounds.map(({ id }) => id),
  };
}

async function validateAndWrite(
  command: ConversationVersionRestoreCommand,
): Promise<ValidatedRestore> {
  const database = await openPalosDB();
  return new Promise<ValidatedRestore>((resolve, reject) => {
    const transaction = database.transaction(
      ["conversations", "sources", "messages", "rounds"],
      "readwrite",
    );
    const conversations = transaction
      .objectStore("conversations")
      .getAll() as IDBRequest<Conversation[]>;
    const messages = transaction
      .objectStore("messages")
      .getAll() as IDBRequest<Message[]>;
    const rounds = transaction
      .objectStore("rounds")
      .getAll() as IDBRequest<Round[]>;
    const sources = transaction
      .objectStore("sources")
      .getAll() as IDBRequest<ImportedSource[]>;
    let completedReads = 0;
    let validated: ValidatedRestore | null = null;
    let validationError: unknown;
    const handleReadSuccess = () => {
      completedReads += 1;
      if (completedReads < 4) return;
      try {
        validated = validateRestore(command, {
          conversations: conversations.result,
          sources: sources.result,
          messages: messages.result,
          rounds: rounds.result,
        });
        transaction
          .objectStore("conversations")
          .put(validated.after.conversation);
        const messageStore = transaction.objectStore("messages");
        for (const messageId of validated.currentMessageIds) {
          messageStore.delete(messageId);
        }
        for (const message of validated.after.messages) {
          messageStore.put(message);
        }
        const roundStore = transaction.objectStore("rounds");
        for (const roundId of validated.currentRoundIds) {
          roundStore.delete(roundId);
        }
        for (const round of validated.after.rounds) {
          roundStore.put(round);
        }
      } catch (error) {
        validationError = error;
        transaction.abort();
      }
    };
    conversations.onsuccess = handleReadSuccess;
    messages.onsuccess = handleReadSuccess;
    rounds.onsuccess = handleReadSuccess;
    sources.onsuccess = handleReadSuccess;
    transaction.oncomplete = () => {
      if (!validated) {
        reject(
          new Error(
            "Conversation Version Restore transaction completed without validation.",
          ),
        );
        return;
      }
      resolve(validated);
    };
    transaction.onerror = () => {
      reject(
        validationError ??
          transaction.error ??
          new Error("Conversation Version Restore transaction failed."),
      );
    };
    transaction.onabort = () => {
      reject(
        validationError ??
          transaction.error ??
          new Error("Conversation Version Restore transaction aborted."),
      );
    };
  });
}

async function reloadRestoreStores(): Promise<PersistedRestoreState> {
  const database = await openPalosDB();
  return new Promise<PersistedRestoreState>((resolve, reject) => {
    const transaction = database.transaction(
      ["conversations", "messages", "rounds"],
      "readonly",
    );
    const conversations = transaction
      .objectStore("conversations")
      .getAll() as IDBRequest<Conversation[]>;
    const messages = transaction
      .objectStore("messages")
      .getAll() as IDBRequest<Message[]>;
    const rounds = transaction
      .objectStore("rounds")
      .getAll() as IDBRequest<Round[]>;
    transaction.oncomplete = () => {
      resolve({
        conversations: conversations.result,
        messages: messages.result,
        rounds: rounds.result,
      });
    };
    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Conversation Version Restore reload failed."),
      );
    };
    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Conversation Version Restore reload aborted."),
      );
    };
  });
}

function verifyReloadedState(
  expected: ValidatedRestore["after"],
  persisted: PersistedRestoreState,
): ConversationVersionRestoreReceipt {
  const conversationId = expected.conversation.id;
  const conversation = persisted.conversations.find(
    ({ id }) => id === conversationId,
  );
  const messages = persisted.messages
    .filter((message) => message.conversationId === conversationId)
    .map(normalizeIndexedDBMessage);
  const rounds = persisted.rounds
    .filter((round) => round.conversationId === conversationId)
    .map(normalizeIndexedDBRound);
  if (
    !conversation ||
    !valuesEqual(
      normalizeIndexedDBConversation(conversation),
      expected.conversation,
    ) ||
    !recordsEqualById(messages, expected.messages) ||
    !recordsEqualById(rounds, expected.rounds)
  ) {
    throw new Error(
      "Conversation Version Restore reload found a canonical store mismatch.",
    );
  }
  const messageIds = new Set(messages.map(({ id }) => id));
  if (
    rounds.some((round) =>
      round.messageIds.some((messageId) => !messageIds.has(messageId)),
    )
  ) {
    throw new Error(
      "Conversation Version Restore reload found a dangling Round Message reference.",
    );
  }
  const pendingWriteCount = getPendingWriteCount();
  if (pendingWriteCount !== 0) {
    throw new Error(
      `Conversation Version Restore reload found ${pendingWriteCount} pending write(s).`,
    );
  }
  return {
    conversation: normalizeIndexedDBConversation(conversation),
    messages,
    rounds,
    referencesVerified: true,
  };
}

export class IndexedDBConversationVersionRestoreWriter
  implements ConversationVersionRestoreWriter
{
  async execute(
    command: ConversationVersionRestoreCommand,
  ): Promise<ConversationVersionRestoreReceipt> {
    await drainPendingWritesOrThrow();
    if (getPendingWriteCount() !== 0) {
      throw new Error(
        "Conversation Version Restore write barrier did not drain pending writes.",
      );
    }

    const validated = await validateAndWrite(command);
    try {
      const persisted = await reloadRestoreStores();
      setConversationCache(persisted.conversations);
      setMessageCache(persisted.messages);
      setRoundCache(persisted.rounds);
      return verifyReloadedState(validated.after, persisted);
    } catch (error) {
      throw new ConversationVersionRestoreReloadVerificationError(error);
    }
  }
}
