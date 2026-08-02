import type {
  ConversationTranscriptMutationBatch,
  ConversationTranscriptMutationCommand,
  ConversationTranscriptMutationWriter,
} from "@/core/contracts/conversation-transcript-mutation-writer";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import {
  assertShareSnapshotTranscriptMutableInSources,
} from "@/core/services/share-snapshot-mutation-guard";
import {
  drainPendingWritesOrThrow,
  getPendingWriteCount,
  openPalosDB,
  type StoreName,
} from "./database";
import { clearCaches, preloadAll } from "./preload";

const STORE_ORDER: readonly StoreName[] = [
  "conversations",
  "sources",
  "messages",
  "rounds",
  "proposals",
  "knowledge-cards",
  "conversation-versions",
];

const BATCH_STORE_NAMES = {
  conversations: "conversations",
  sources: "sources",
  messages: "messages",
  rounds: "rounds",
  proposals: "proposals",
  knowledgeCards: "knowledge-cards",
  conversationVersions: "conversation-versions",
} as const satisfies Record<keyof ConversationTranscriptMutationBatch, StoreName>;

export class ConversationTranscriptMutationReloadError extends Error {
  readonly committed = true;
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      "Conversation transcript mutation committed, but the IndexedDB cache reload failed; no rollback was attempted.",
    );
    this.name = "ConversationTranscriptMutationReloadError";
    this.cause = cause;
  }
}

function requestedStoreNames(
  command: ConversationTranscriptMutationCommand,
): StoreName[] {
  const requested = new Set<StoreName>(["sources"]);
  for (const [key, records] of Object.entries(command.put ?? {}) as Array<
    [keyof ConversationTranscriptMutationBatch, readonly unknown[]]
  >) {
    if (records.length > 0) requested.add(BATCH_STORE_NAMES[key]);
  }
  if ((command.replaceMessages?.length ?? 0) > 0) requested.add("messages");
  if ((command.replaceRounds?.length ?? 0) > 0) requested.add("rounds");
  return STORE_ORDER.filter((storeName) => requested.has(storeName));
}

function assertCommand(command: ConversationTranscriptMutationCommand): void {
  const conversationIds = [...new Set(command.conversationIds)];
  if (
    conversationIds.length === 0 ||
    conversationIds.some((conversationId) => !conversationId.trim()) ||
    !command.operation.trim()
  ) {
    throw new Error(
      "Conversation transcript mutation requires guarded Conversation IDs and an operation.",
    );
  }

  for (const replacement of command.replaceMessages ?? []) {
    if (
      !replacement.conversationId ||
      replacement.messages.some(
        (message) => message.conversationId !== replacement.conversationId,
      )
    ) {
      throw new Error(
        "Conversation transcript Message replacement must preserve ownership.",
      );
    }
  }
  for (const replacement of command.replaceRounds ?? []) {
    if (
      !replacement.conversationId ||
      replacement.rounds.some(
        (round) => round.conversationId !== replacement.conversationId,
      )
    ) {
      throw new Error(
        "Conversation transcript Round replacement must preserve ownership.",
      );
    }
  }
  if (command.put?.sources?.some((source) => source.shareSnapshot)) {
    throw new Error(
      "Immutable Snapshot Sources may only be written by the canonical Snapshot writer.",
    );
  }
}

function putBatch(
  transaction: IDBTransaction,
  batch: ConversationTranscriptMutationBatch | undefined,
): void {
  for (const [key, records] of Object.entries(batch ?? {}) as Array<
    [keyof ConversationTranscriptMutationBatch, readonly Readonly<{ id: string }>[]]
  >) {
    if (records.length === 0) continue;
    const store = transaction.objectStore(BATCH_STORE_NAMES[key]);
    for (const record of records) store.put(record);
  }
}

async function validateAndWrite(
  command: ConversationTranscriptMutationCommand,
): Promise<void> {
  assertCommand(command);
  const database = await openPalosDB();
  const storeNames = requestedStoreNames(command);

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeNames, "readwrite");
    const sourcesRequest = transaction
      .objectStore("sources")
      .getAll() as IDBRequest<ImportedSource[]>;
    const messagesRequest = command.replaceMessages?.length
      ? (transaction.objectStore("messages").getAll() as IDBRequest<Message[]>)
      : null;
    const roundsRequest = command.replaceRounds?.length
      ? (transaction.objectStore("rounds").getAll() as IDBRequest<Round[]>)
      : null;
    const requests: IDBRequest[] = [sourcesRequest];
    if (messagesRequest) requests.push(messagesRequest);
    if (roundsRequest) requests.push(roundsRequest);
    let completedReads = 0;
    let validationError: unknown;
    let writesQueued = false;

    const handleReadSuccess = () => {
      completedReads += 1;
      if (completedReads < requests.length || writesQueued) return;
      try {
        for (const conversationId of new Set(command.conversationIds)) {
          assertShareSnapshotTranscriptMutableInSources(
            sourcesRequest.result,
            conversationId,
            command.operation,
          );
        }

        const messageStore = messagesRequest
          ? transaction.objectStore("messages")
          : null;
        for (const replacement of command.replaceMessages ?? []) {
          for (const message of messagesRequest?.result ?? []) {
            if (message.conversationId === replacement.conversationId) {
              messageStore?.delete(message.id);
            }
          }
          for (const message of replacement.messages) messageStore?.put(message);
        }

        const roundStore = roundsRequest
          ? transaction.objectStore("rounds")
          : null;
        for (const replacement of command.replaceRounds ?? []) {
          for (const round of roundsRequest?.result ?? []) {
            if (round.conversationId === replacement.conversationId) {
              roundStore?.delete(round.id);
            }
          }
          for (const round of replacement.rounds) roundStore?.put(round);
        }

        putBatch(transaction, command.put);
        writesQueued = true;
      } catch (error) {
        validationError = error;
        transaction.abort();
      }
    };

    for (const request of requests) request.onsuccess = handleReadSuccess;
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(
        validationError ??
          transaction.error ??
          new Error("Conversation transcript mutation transaction failed."),
      );
    };
    transaction.onabort = () => {
      reject(
        validationError ??
          transaction.error ??
          new Error("Conversation transcript mutation transaction aborted."),
      );
    };
  });
}

export class IndexedDBConversationTranscriptMutationWriter
  implements ConversationTranscriptMutationWriter
{
  async execute(command: ConversationTranscriptMutationCommand): Promise<void> {
    await drainPendingWritesOrThrow();
    if (getPendingWriteCount() !== 0) {
      throw new Error(
        "Conversation transcript mutation write barrier did not drain pending writes.",
      );
    }

    await validateAndWrite(command);
    try {
      clearCaches();
      await preloadAll();
    } catch (error) {
      throw new ConversationTranscriptMutationReloadError(error);
    }
  }
}
