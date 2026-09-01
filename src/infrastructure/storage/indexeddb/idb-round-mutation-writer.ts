import type {
  RoundEnrichmentPatch,
  RoundMutationCommand,
  RoundMutationWriter,
} from "@/core/contracts/round-mutation-writer";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Round } from "@/core/entities/round";
import { isShareSnapshotOwnedConversationInSources } from "@/core/services/share-snapshot-mutation-guard";
import {
  drainPendingWritesOrThrow,
  getPendingWriteCount,
  openPalosDB,
} from "./database";
import { clearCaches, getRoundCache, preloadAll } from "./preload";

const ENRICHMENT_FIELDS = ["note", "summary", "context"] as const;
type EnrichmentField = (typeof ENRICHMENT_FIELDS)[number];

export class RoundMutationConflictError extends Error {
  constructor(readonly field: EnrichmentField) {
    super(`Round ${field} changed after editing began; reload and retry.`);
    this.name = "RoundMutationConflictError";
  }
}

export class RoundMutationReloadError extends Error {
  readonly committed = true;
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      "Round enrichment committed, but the IndexedDB cache reload failed; no rollback was attempted.",
    );
    this.name = "RoundMutationReloadError";
    this.cause = cause;
  }
}

function hasField(
  value: RoundEnrichmentPatch,
  field: EnrichmentField,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left ?? null)) ===
    JSON.stringify(stableValue(right ?? null));
}

function normalizeText(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

function assertCommand(command: RoundMutationCommand): EnrichmentField[] {
  if (
    !command.roundId.trim() ||
    !command.conversationId.trim() ||
    !command.operation.trim()
  ) {
    throw new Error(
      "Round mutation requires a Round ID, Conversation ID, and operation.",
    );
  }

  const fields = ENRICHMENT_FIELDS.filter((field) =>
    hasField(command.patch, field),
  );
  if (fields.length === 0) {
    throw new Error("Round mutation requires an enrichment patch.");
  }
  if (fields.some((field) => !hasField(command.expected, field))) {
    throw new Error(
      "Round mutation requires an expected baseline for every patched field.",
    );
  }
  return fields;
}

function mergePatch(
  round: Round,
  patch: RoundEnrichmentPatch,
  fields: readonly EnrichmentField[],
): Round {
  const updated: Round = {
    ...round,
    messageIds: [...round.messageIds],
    context: round.context ? structuredClone(round.context) : undefined,
    updatedAt: new Date().toISOString(),
  };
  for (const field of fields) {
    if (field === "note" || field === "summary") {
      updated[field] = normalizeText(patch[field]);
    } else {
      updated.context = patch.context ? structuredClone(patch.context) : undefined;
    }
  }
  return updated;
}

async function validateAndWrite(command: RoundMutationCommand): Promise<void> {
  const fields = assertCommand(command);
  const database = await openPalosDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["sources", "rounds"], "readwrite");
    const sourcesRequest = transaction
      .objectStore("sources")
      .getAll() as IDBRequest<ImportedSource[]>;
    const roundsRequest = transaction
      .objectStore("rounds")
      .getAll() as IDBRequest<Round[]>;
    let completedReads = 0;
    let operationError: unknown;

    const handleReadSuccess = () => {
      completedReads += 1;
      if (completedReads !== 2) return;
      try {
        const authoritative = roundsRequest.result.find(
          (round) => round.id === command.roundId,
        );
        if (!authoritative) throw new Error("Round no longer exists.");
        if (authoritative.conversationId !== command.conversationId) {
          throw new Error("Round ownership changed; reload and retry.");
        }

        // Snapshot ownership is read in the same transaction. Enrichment is
        // intentionally allowed, but only as a patch merged onto the current
        // authoritative transcript Round.
        isShareSnapshotOwnedConversationInSources(
          sourcesRequest.result,
          command.conversationId,
        );

        for (const field of fields) {
          if (!valuesMatch(authoritative[field], command.expected[field])) {
            throw new RoundMutationConflictError(field);
          }
        }
        transaction
          .objectStore("rounds")
          .put(mergePatch(authoritative, command.patch, fields));
      } catch (error) {
        operationError = error;
        transaction.abort();
      }
    };

    sourcesRequest.onsuccess = handleReadSuccess;
    roundsRequest.onsuccess = handleReadSuccess;
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(
        operationError ??
          transaction.error ??
          new Error("Round mutation transaction failed."),
      );
    };
    transaction.onabort = () => {
      reject(
        operationError ??
          transaction.error ??
          new Error("Round mutation transaction aborted."),
      );
    };
  });
}

export class IndexedDBRoundMutationWriter implements RoundMutationWriter {
  async execute(command: RoundMutationCommand): Promise<Round> {
    await drainPendingWritesOrThrow();
    if (getPendingWriteCount() !== 0) {
      throw new Error("Round mutation write barrier did not drain pending writes.");
    }
    await validateAndWrite(command);

    try {
      clearCaches();
      await preloadAll();
    } catch (error) {
      throw new RoundMutationReloadError(error);
    }

    const round = getRoundCache().find((item) => item.id === command.roundId);
    if (!round) {
      throw new RoundMutationReloadError(
        new Error("Committed Round is unavailable after reload."),
      );
    }
    return structuredClone(round);
  }
}
