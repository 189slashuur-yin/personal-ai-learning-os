import type { Conversation } from "@/core/entities/conversation";
import {
  isChatGPTShareSnapshotMetadata,
  type ImportedSource,
} from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import {
  migrateLegacyMutableShareSnapshotSource,
  type LegacyShareSnapshotMigrationBlockedReason,
} from "@/core/services/chatgpt-share-snapshot-migration";
import {
  drainPendingWritesOrThrow,
  getPendingWriteCount,
  openPalosDB,
} from "@/infrastructure/storage/indexeddb/database";
import {
  clearCaches,
  preloadAll,
  type PreloadCounts,
} from "@/infrastructure/storage/indexeddb/preload";

export type LegacyShareSnapshotMigrationWorkflowBlockedReason =
  | LegacyShareSnapshotMigrationBlockedReason
  | "confirmation-required"
  | "authoritative-state-changed"
  | "transaction-failed"
  | "reload-verification-failed";

export type LegacyShareSnapshotMigrationPreflight =
  | Readonly<{
      status: "migrated";
      phase: "preflight";
      previewId: string;
      sourceId: string;
      conversationId: string;
      resourceHash: string;
      confirmable: true;
    }>
  | Readonly<{
      status: "noop";
      phase: "preflight";
      previewId: string;
      sourceId: string;
      confirmable: false;
    }>
  | Readonly<{
      status: "blocked";
      phase: "preflight";
      previewId: string;
      sourceId: string;
      confirmable: false;
      reason: LegacyShareSnapshotMigrationWorkflowBlockedReason;
      error: string;
    }>;

export type LegacyShareSnapshotMigrationConfirmation = Readonly<{
  previewId: string;
  confirmed: boolean;
}>;

export type LegacyShareSnapshotMigrationVerification = Readonly<{
  sourceId: string;
  conversationId: string;
  resourceHash: string;
  snapshotSequence: 1;
  previousSnapshotSourceId: undefined;
  sourceIdPreserved: true;
  messageIdsPreserved: true;
  messageProvenancePreserved: true;
  transcriptPreserved: true;
  capturedAtPreserved: true;
  pendingWriteCount: 0;
}>;

export type LegacyShareSnapshotMigrationConfirmationResult =
  | Readonly<{
      status: "migrated";
      phase: "committed";
      previewId: string;
      preloadCounts: PreloadCounts;
      verification: LegacyShareSnapshotMigrationVerification;
    }>
  | Readonly<{
      status: "noop";
      phase: "committed";
      previewId: string;
      sourceId: string;
    }>
  | Readonly<{
      status: "blocked";
      phase: "committed";
      previewId: string;
      reason: LegacyShareSnapshotMigrationWorkflowBlockedReason;
      error: string;
    }>;

type MigrationState = {
  conversations: Conversation[];
  sources: ImportedSource[];
  messages: Message[];
  rounds: Round[];
};

type MigrationPlan = {
  sourceBefore: Readonly<ImportedSource>;
  sourceAfter: Readonly<ImportedSource>;
  sourcesBefore: readonly Readonly<ImportedSource>[];
  messagesBefore: readonly Readonly<Message>[];
  roundsBefore: readonly Readonly<Round>[];
  conversationId: string;
};

type StoredPreview = {
  plan: MigrationPlan;
  lifecycle: "ready" | "confirming" | "consumed";
};

class AuthoritativeMigrationStateChangedError extends Error {
  constructor() {
    super("Legacy Snapshot migration target changed after preflight.");
    this.name = "AuthoritativeMigrationStateChangedError";
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

function recordsMatch<T extends { id: string }>(
  actual: readonly Readonly<T>[],
  expected: readonly Readonly<T>[],
): boolean {
  if (actual.length !== expected.length) return false;
  const actualById = new Map(actual.map((record) => [record.id, record]));
  return expected.every((record) => {
    const candidate = actualById.get(record.id);
    return Boolean(candidate && valuesEqual(candidate, record));
  });
}

async function readMigrationState(): Promise<MigrationState> {
  const database = await openPalosDB();
  return new Promise<MigrationState>((resolve, reject) => {
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
      reject(
        transaction.error ??
          new Error("Legacy Snapshot migration preflight read failed."),
      );
    };
    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Legacy Snapshot migration preflight read aborted."),
      );
    };
  });
}

async function migrateInAuthoritativeTransaction(
  plan: MigrationPlan,
): Promise<void> {
  const database = await openPalosDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      ["conversations", "sources", "messages", "rounds"],
      "readwrite",
    );
    let validationError: unknown;
    let completedReads = 0;
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

    const handleReadSuccess = () => {
      completedReads += 1;
      if (completedReads < 4) return;
      try {
        if (
          !conversations.result.some(({ id }) => id === plan.conversationId) ||
          !recordsMatch(sources.result, plan.sourcesBefore) ||
          !recordsMatch(messages.result, plan.messagesBefore) ||
          !recordsMatch(rounds.result, plan.roundsBefore)
        ) {
          throw new AuthoritativeMigrationStateChangedError();
        }
        const source = sources.result.find(
          ({ id }) => id === plan.sourceBefore.id,
        );
        if (!source || !valuesEqual(source, plan.sourceBefore)) {
          throw new AuthoritativeMigrationStateChangedError();
        }
        transaction.objectStore("sources").put(plan.sourceAfter);
      } catch (error) {
        validationError = error;
        transaction.abort();
      }
    };
    conversations.onsuccess = handleReadSuccess;
    sources.onsuccess = handleReadSuccess;
    messages.onsuccess = handleReadSuccess;
    rounds.onsuccess = handleReadSuccess;
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(
        validationError ??
          transaction.error ??
          new Error("Legacy Snapshot migration transaction failed."),
      );
    };
    transaction.onabort = () => {
      reject(
        validationError ??
          transaction.error ??
          new Error("Legacy Snapshot migration transaction aborted."),
      );
    };
  });
}

async function verifyReloadedMigration(
  plan: MigrationPlan,
): Promise<{
  preloadCounts: PreloadCounts;
  verification: LegacyShareSnapshotMigrationVerification;
}> {
  clearCaches();
  const preloadCounts = await preloadAll();
  const state = await readMigrationState();
  const expectedSources = plan.sourcesBefore.map((source) =>
    source.id === plan.sourceBefore.id ? plan.sourceAfter : source,
  );
  if (
    !recordsMatch(state.sources, expectedSources) ||
    !recordsMatch(state.messages, plan.messagesBefore) ||
    !recordsMatch(state.rounds, plan.roundsBefore)
  ) {
    throw new Error(
      "Legacy Snapshot migration reload verification found a canonical store mismatch.",
    );
  }
  const source = state.sources.find(({ id }) => id === plan.sourceAfter.id);
  if (
    !source ||
    !valuesEqual(source, plan.sourceAfter) ||
    source.id !== plan.sourceBefore.id ||
    source.content !== plan.sourceBefore.content
  ) {
    throw new Error(
      "Legacy Snapshot migration did not preserve the Source identity or transcript.",
    );
  }
  const beforeMetadata = plan.sourceBefore.shareSnapshot;
  const afterMetadata = source.shareSnapshot;
  if (
    !beforeMetadata ||
    !isChatGPTShareSnapshotMetadata(afterMetadata) ||
    afterMetadata.capturedAt !== beforeMetadata.capturedAt ||
    afterMetadata.snapshotSequence !== 1 ||
    afterMetadata.previousSnapshotSourceId !== undefined
  ) {
    throw new Error(
      "Legacy Snapshot migration metadata reload verification failed.",
    );
  }
  const repeated = await migrateLegacyMutableShareSnapshotSource({
    source,
    messages: state.messages,
    rounds: state.rounds,
    sources: state.sources,
  });
  if (repeated.status !== "noop") {
    throw new Error(
      "Legacy Snapshot migration is not idempotent after reload.",
    );
  }
  const pendingWriteCount = getPendingWriteCount();
  if (pendingWriteCount !== 0) {
    throw new Error(
      `Legacy Snapshot migration verification found ${pendingWriteCount} pending write(s).`,
    );
  }
  return {
    preloadCounts,
    verification: {
      sourceId: source.id,
      conversationId: plan.conversationId,
      resourceHash: afterMetadata.resourceHash,
      snapshotSequence: 1,
      previousSnapshotSourceId: undefined,
      sourceIdPreserved: true,
      messageIdsPreserved: true,
      messageProvenancePreserved: true,
      transcriptPreserved: true,
      capturedAtPreserved: true,
      pendingWriteCount: 0,
    },
  };
}

function workflowBlocked(
  previewId: string,
  phase: "preflight" | "committed",
  sourceId: string,
  reason: LegacyShareSnapshotMigrationWorkflowBlockedReason,
  error: string,
): LegacyShareSnapshotMigrationPreflight | LegacyShareSnapshotMigrationConfirmationResult {
  if (phase === "preflight") {
    return {
      status: "blocked",
      phase,
      previewId,
      sourceId,
      confirmable: false,
      reason,
      error,
    };
  }
  return {
    status: "blocked",
    phase,
    previewId,
    reason,
    error,
  };
}

export class IndexedDBLegacyShareSnapshotMigrationWorkflow {
  private readonly previews = new Map<string, StoredPreview>();
  private readonly usedPreviewIds = new Set<string>();

  constructor(
    private readonly createPreviewId: () => string = () =>
      crypto.randomUUID(),
  ) {}

  async preflight(
    sourceId: string,
  ): Promise<LegacyShareSnapshotMigrationPreflight> {
    const previewId = this.allocatePreviewId();
    const normalizedSourceId = sourceId.trim();
    if (!normalizedSourceId) {
      return workflowBlocked(
        previewId,
        "preflight",
        sourceId,
        "invalid-legacy-metadata",
        "Legacy Snapshot migration Source ID is required.",
      ) as LegacyShareSnapshotMigrationPreflight;
    }

    let state: MigrationState;
    try {
      await drainPendingWritesOrThrow();
      state = await readMigrationState();
    } catch (error) {
      return workflowBlocked(
        previewId,
        "preflight",
        normalizedSourceId,
        "transaction-failed",
        error instanceof Error ? error.message : String(error),
      ) as LegacyShareSnapshotMigrationPreflight;
    }
    const source = state.sources.find(({ id }) => id === normalizedSourceId);
    if (!source) {
      return workflowBlocked(
        previewId,
        "preflight",
        normalizedSourceId,
        "invalid-legacy-metadata",
        `Legacy Snapshot Source ${normalizedSourceId} does not exist.`,
      ) as LegacyShareSnapshotMigrationPreflight;
    }
    if (
      !source.conversationId ||
      !state.conversations.some(({ id }) => id === source.conversationId)
    ) {
      return workflowBlocked(
        previewId,
        "preflight",
        normalizedSourceId,
        "missing-source-ownership",
        `Source ${normalizedSourceId} has no valid owning Conversation.`,
      ) as LegacyShareSnapshotMigrationPreflight;
    }

    let result: Awaited<
      ReturnType<typeof migrateLegacyMutableShareSnapshotSource>
    >;
    try {
      result = await migrateLegacyMutableShareSnapshotSource({
        source,
        messages: state.messages,
        rounds: state.rounds,
        sources: state.sources,
      });
    } catch (error) {
      return workflowBlocked(
        previewId,
        "preflight",
        normalizedSourceId,
        "transaction-failed",
        error instanceof Error ? error.message : String(error),
      ) as LegacyShareSnapshotMigrationPreflight;
    }
    if (result.status === "blocked") {
      return workflowBlocked(
        previewId,
        "preflight",
        normalizedSourceId,
        result.reason,
        result.error,
      ) as LegacyShareSnapshotMigrationPreflight;
    }
    if (result.status === "noop") {
      return {
        status: "noop",
        phase: "preflight",
        previewId,
        sourceId: result.source.id,
        confirmable: false,
      };
    }
    const metadata = result.source.shareSnapshot;
    if (!isChatGPTShareSnapshotMetadata(metadata)) {
      return workflowBlocked(
        previewId,
        "preflight",
        normalizedSourceId,
        "invalid-legacy-metadata",
        `Source ${normalizedSourceId} did not produce immutable metadata.`,
      ) as LegacyShareSnapshotMigrationPreflight;
    }
    this.previews.set(previewId, {
      lifecycle: "ready",
      plan: {
        sourceBefore: source,
        sourceAfter: result.source,
        sourcesBefore: state.sources,
        messagesBefore: state.messages,
        roundsBefore: state.rounds,
        conversationId: source.conversationId,
      },
    });
    return {
      status: "migrated",
      phase: "preflight",
      previewId,
      sourceId: source.id,
      conversationId: source.conversationId,
      resourceHash: metadata.resourceHash,
      confirmable: true,
    };
  }

  async confirm(
    confirmation: LegacyShareSnapshotMigrationConfirmation,
  ): Promise<LegacyShareSnapshotMigrationConfirmationResult> {
    const stored = this.previews.get(confirmation.previewId);
    if (!stored || stored.lifecycle !== "ready" || !confirmation.confirmed) {
      if (stored) {
        stored.lifecycle = "consumed";
        this.previews.delete(confirmation.previewId);
      }
      return workflowBlocked(
        confirmation.previewId,
        "committed",
        stored?.plan.sourceBefore.id ?? "",
        "confirmation-required",
        "Legacy Snapshot migration requires a fresh explicitly confirmed preflight.",
      ) as LegacyShareSnapshotMigrationConfirmationResult;
    }

    stored.lifecycle = "confirming";
    try {
      await drainPendingWritesOrThrow();
      await migrateInAuthoritativeTransaction(stored.plan);
    } catch (error) {
      stored.lifecycle = "consumed";
      this.previews.delete(confirmation.previewId);
      const stateChanged =
        error instanceof AuthoritativeMigrationStateChangedError;
      return workflowBlocked(
        confirmation.previewId,
        "committed",
        stored.plan.sourceBefore.id,
        stateChanged
          ? "authoritative-state-changed"
          : "transaction-failed",
        error instanceof Error ? error.message : String(error),
      ) as LegacyShareSnapshotMigrationConfirmationResult;
    }

    stored.lifecycle = "consumed";
    this.previews.delete(confirmation.previewId);
    try {
      const { preloadCounts, verification } =
        await verifyReloadedMigration(stored.plan);
      return {
        status: "migrated",
        phase: "committed",
        previewId: confirmation.previewId,
        preloadCounts,
        verification,
      };
    } catch (error) {
      return workflowBlocked(
        confirmation.previewId,
        "committed",
        stored.plan.sourceBefore.id,
        "reload-verification-failed",
        error instanceof Error ? error.message : String(error),
      ) as LegacyShareSnapshotMigrationConfirmationResult;
    }
  }

  private allocatePreviewId(): string {
    const previewId = this.createPreviewId().trim();
    if (!previewId) {
      throw new Error("Legacy Snapshot migration preview ID is required.");
    }
    if (this.usedPreviewIds.has(previewId)) {
      throw new Error(
        `Legacy Snapshot migration preview ${previewId} already exists.`,
      );
    }
    this.usedPreviewIds.add(previewId);
    return previewId;
  }
}
