import type {
  ShareSnapshotCanonicalWriteCommand,
  ShareSnapshotCanonicalWriteReceipt,
  ShareSnapshotCanonicalWriter,
} from "@/core/contracts/share-snapshot-canonical-writer";
import type { Conversation } from "@/core/entities/conversation";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import {
  buildShareSnapshotBaseline,
  sourceMatchesShareIdentity,
} from "@/core/models/share-snapshot-baseline";
import {
  drainPendingWritesOrThrow,
  openPalosDB,
} from "@/infrastructure/storage/indexeddb/database";
import { executeShareSnapshotCanonicalOperation } from "@/infrastructure/storage/indexeddb/share-snapshot-operation";

type PersistedShareSnapshotState = {
  conversations: Conversation[];
  sources: ImportedSource[];
  messages: Message[];
  rounds: Round[];
};

async function readPersistedState(): Promise<PersistedShareSnapshotState> {
  const database = await openPalosDB();
  return new Promise<PersistedShareSnapshotState>((resolve, reject) => {
    const transaction = database.transaction(
      ["conversations", "sources", "messages", "rounds"],
      "readonly",
    );
    const conversations = transaction
      .objectStore("conversations")
      .getAll() as IDBRequest<Conversation[]>;
    const sources = transaction
      .objectStore("sources")
      .getAll() as IDBRequest<ImportedSource[]>;
    const messages = transaction
      .objectStore("messages")
      .getAll() as IDBRequest<Message[]>;
    const rounds = transaction
      .objectStore("rounds")
      .getAll() as IDBRequest<Round[]>;
    transaction.oncomplete = () => {
      resolve({
        conversations: conversations.result,
        sources: sources.result,
        messages: messages.result,
        rounds: rounds.result,
      });
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB baseline read failed."));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB baseline read aborted."));
    };
  });
}

async function capturePersistedBaseline(
  command: ShareSnapshotCanonicalWriteCommand,
): Promise<string> {
  const expected = command.expectedBaseline;
  const state = await readPersistedState();
  const conversation =
    state.conversations.find(
      (candidate) => candidate.id === expected.conversationId,
    ) ?? null;
  const source = expected.sourceId
    ? state.sources.find((candidate) => candidate.id === expected.sourceId) ??
      null
    : null;
  const historySources = state.sources.filter((candidate) =>
    sourceMatchesShareIdentity(candidate, expected.identity),
  );
  const baseline = await buildShareSnapshotBaseline({
    kind: expected.kind,
    conversationId: expected.conversationId,
    sourceId: expected.sourceId,
    identity: expected.identity,
    conversation,
    source,
    historySources,
    messages: conversation
      ? state.messages.filter(
          (message) => message.conversationId === expected.conversationId,
        )
      : [],
    rounds: conversation
      ? state.rounds.filter(
          (round) => round.conversationId === expected.conversationId,
        )
      : [],
    matchingSourceIds: historySources.map((candidate) => candidate.id),
  });
  return baseline.fingerprint;
}

export class IndexedDBShareSnapshotCanonicalWriter
  implements ShareSnapshotCanonicalWriter
{
  async execute(
    command: ShareSnapshotCanonicalWriteCommand,
  ): Promise<ShareSnapshotCanonicalWriteReceipt> {
    await drainPendingWritesOrThrow();
    const actualFingerprint = await capturePersistedBaseline(command);
    if (actualFingerprint !== command.expectedBaseline.fingerprint) {
      return {
        status: "stale",
        expectedFingerprint: command.expectedBaseline.fingerprint,
        actualFingerprint,
      };
    }

    const result = await executeShareSnapshotCanonicalOperation(command.plan);
    return {
      status: "written",
      conversationId: result.verification.conversationId,
      sourceId: result.verification.sourceId,
      writtenMessageCount: result.written.messages,
      writtenRoundCount: result.written.rounds,
      verifiedMessageCount: result.verification.messageCount,
      verifiedRoundCount: result.verification.roundCount,
      pendingWriteCount: result.verification.pendingWriteCount,
    };
  }
}
