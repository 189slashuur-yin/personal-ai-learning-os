import type { Conversation } from "@/core/entities/conversation";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Message } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";
import type { Round } from "@/core/entities/round";
import {
  drainPendingWrites,
  readAll,
  replaceStores,
  type StoreBatch,
  type StoreName,
} from "@/infrastructure/storage/indexeddb/database";
import {
  clearCaches,
  preloadAll,
} from "@/infrastructure/storage/indexeddb/preload";
import { BrowserAppDataStorage } from "./browser-app-data-storage";

export type AppDataBundle = {
  schemaVersion: 1;
  exportedAt: string;
  data: Record<string, unknown>;
  indexedDB?: {
    conversations?: Conversation[];
    messages?: Message[];
    rounds?: Round[];
    sources?: ImportedSource[];
    proposals?: Proposal[];
    knowledgeCards?: KnowledgeCard[];
    conversationVersions?: ConversationVersion[];
  };
};

export type AppDataPreview = {
  bundle: AppDataBundle;
  keys: string[];
  counts: Record<string, number>;
  indexedDBCounts: Record<string, number>;
};

const IDB_BUNDLE_KEYS = [
  "conversations",
  "messages",
  "rounds",
  "sources",
  "proposals",
  "knowledgeCards",
  "conversationVersions",
] as const;

type IndexedDBBundleKey = (typeof IDB_BUNDLE_KEYS)[number];
type EntityRecord = Record<string, unknown> & { id: string };
type RestoreWriter = (batch: StoreBatch) => Promise<void>;

const bundleKeyToStoreName: Record<IndexedDBBundleKey, StoreName> = {
  conversations: "conversations",
  messages: "messages",
  rounds: "rounds",
  sources: "sources",
  proposals: "proposals",
  knowledgeCards: "knowledge-cards",
  conversationVersions: "conversation-versions",
};

function countValue(value: unknown): number {
  return Array.isArray(value) ? value.length : value === undefined ? 0 : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBundleEnvelope(bundle: AppDataBundle): void {
  if (
    bundle?.schemaVersion !== 1 ||
    typeof bundle.exportedAt !== "string" ||
    !bundle.exportedAt ||
    !isRecord(bundle.data)
  ) {
    throw new Error("Unsupported app data bundle.");
  }
}

function validateRecords(
  key: IndexedDBBundleKey,
  value: unknown,
): EntityRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`IndexedDB restore payload ${key} must be an array.`);
  }
  const records = value.map((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !candidate.id) {
      throw new Error(
        `IndexedDB restore payload ${key}[${index}] is missing a valid id.`,
      );
    }
    return candidate as EntityRecord;
  });
  const ids = new Set(records.map((record) => record.id));
  if (ids.size !== records.length) {
    throw new Error(`IndexedDB restore payload ${key} contains duplicate ids.`);
  }
  return records;
}

function validateReference(
  record: EntityRecord,
  field: string,
  targetIds: Set<string> | undefined,
  owner: string,
): void {
  const value = record[field];
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string") {
    throw new Error(`${owner}.${field} must be a string.`);
  }
  if (targetIds && !targetIds.has(value)) {
    throw new Error(`${owner}.${field} references missing id ${value}.`);
  }
}

function validateIndexedDBBundle(bundle: AppDataBundle): void {
  if (bundle.indexedDB === undefined) return;
  if (!isRecord(bundle.indexedDB)) {
    throw new Error("IndexedDB restore payload must be an object.");
  }
  const unknownKeys = Object.keys(bundle.indexedDB).filter(
    (key) => !IDB_BUNDLE_KEYS.includes(key as IndexedDBBundleKey),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `IndexedDB restore payload contains unknown keys: ${unknownKeys.join(", ")}.`,
    );
  }

  const records = Object.fromEntries(
    IDB_BUNDLE_KEYS.flatMap((key) =>
      key in bundle.indexedDB!
        ? [[key, validateRecords(key, bundle.indexedDB![key])]]
        : [],
    ),
  ) as Partial<Record<IndexedDBBundleKey, EntityRecord[]>>;
  const ids = Object.fromEntries(
    IDB_BUNDLE_KEYS.flatMap((key) =>
      records[key]
        ? [[key, new Set(records[key]!.map((record) => record.id))]]
        : [],
    ),
  ) as Partial<Record<IndexedDBBundleKey, Set<string>>>;

  for (const record of records.messages ?? []) {
    validateReference(record, "conversationId", ids.conversations, `messages.${record.id}`);
  }
  for (const record of records.rounds ?? []) {
    validateReference(record, "conversationId", ids.conversations, `rounds.${record.id}`);
    if (!Array.isArray(record.messageIds)) {
      throw new Error(`rounds.${record.id}.messageIds must be an array.`);
    }
    for (const messageId of record.messageIds) {
      if (typeof messageId !== "string") {
        throw new Error(`rounds.${record.id}.messageIds must contain strings.`);
      }
      if (ids.messages && !ids.messages.has(messageId)) {
        throw new Error(`rounds.${record.id} references missing message ${messageId}.`);
      }
    }
  }
  for (const record of records.sources ?? []) {
    validateReference(record, "conversationId", ids.conversations, `sources.${record.id}`);
  }
  for (const record of records.proposals ?? []) {
    validateReference(record, "conversationId", ids.conversations, `proposals.${record.id}`);
    validateReference(record, "sourceId", ids.sources, `proposals.${record.id}`);
    validateReference(record, "sourceRoundId", ids.rounds, `proposals.${record.id}`);
    if (record.sourceMessageIds !== undefined) {
      if (!Array.isArray(record.sourceMessageIds)) {
        throw new Error(`proposals.${record.id}.sourceMessageIds must be an array.`);
      }
      for (const messageId of record.sourceMessageIds) {
        if (typeof messageId !== "string") {
          throw new Error(
            `proposals.${record.id}.sourceMessageIds must contain strings.`,
          );
        }
        if (ids.messages && !ids.messages.has(messageId)) {
          throw new Error(
            `proposals.${record.id} references missing message ${messageId}.`,
          );
        }
      }
    }
  }
  for (const record of records.conversationVersions ?? []) {
    validateReference(
      record,
      "conversationId",
      ids.conversations,
      `conversationVersions.${record.id}`,
    );
  }
}

function selectedIndexedDBBatch(bundle: AppDataBundle): Partial<Record<StoreName, unknown[]>> {
  const indexedDB = bundle.indexedDB ?? {};
  return Object.fromEntries(
    IDB_BUNDLE_KEYS.flatMap((key) => {
      const records = indexedDB[key];
      if (!Array.isArray(records)) return [];
      return [[bundleKeyToStoreName[key], records]];
    }),
  ) as Partial<Record<StoreName, unknown[]>>;
}

async function snapshotStores(storeNames: StoreName[]): Promise<StoreBatch> {
  const entries = await Promise.all(
    storeNames.map(async (storeName) => [storeName, await readAll(storeName)] as const),
  );
  return Object.fromEntries(entries) as StoreBatch;
}

function idsForVerification(records: unknown[], storeName: StoreName): string[] {
  return records
    .map((record) => {
      if (!isRecord(record) || typeof record.id !== "string") {
        throw new Error(`Restore verification found an invalid ${storeName} record.`);
      }
      return record.id;
    })
    .sort();
}

async function verifyStores(batch: StoreBatch): Promise<number> {
  let verifiedRecords = 0;
  for (const [storeName, expected] of Object.entries(batch) as Array<
    [StoreName, unknown[]]
  >) {
    const actual = await readAll(storeName);
    const expectedIds = idsForVerification(expected, storeName);
    const actualIds = idsForVerification(actual, storeName);
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      throw new Error(
        `IndexedDB verification mismatch for ${storeName}: expected ${expectedIds.length}, got ${actualIds.length}.`,
      );
    }
    verifiedRecords += actualIds.length;
  }
  return verifiedRecords;
}

export class AppDataRestoreError extends Error {
  constructor(
    message: string,
    readonly rollbackSucceeded: boolean,
  ) {
    super(message);
    this.name = "AppDataRestoreError";
  }
}

export class AppDataStorage {
  private readonly legacy = new BrowserAppDataStorage();

  constructor(private readonly restoreWriter: RestoreWriter = replaceStores) {}

  async exportData(): Promise<AppDataBundle> {
    await preloadAll();
    const legacyBundle = this.legacy.exportData();
    const [
      conversations,
      messages,
      rounds,
      sources,
      proposals,
      knowledgeCards,
      conversationVersions,
    ] = await Promise.all([
      readAll<Conversation>("conversations"),
      readAll<Message>("messages"),
      readAll<Round>("rounds"),
      readAll<ImportedSource>("sources"),
      readAll<Proposal>("proposals"),
      readAll<KnowledgeCard>("knowledge-cards"),
      readAll<ConversationVersion>("conversation-versions"),
    ]);

    return {
      ...legacyBundle,
      indexedDB: {
        conversations,
        messages,
        rounds,
        sources,
        proposals,
        knowledgeCards,
        conversationVersions,
      },
    };
  }

  preview(text: string): AppDataPreview {
    const legacyPreview = this.legacy.preview(text);
    const bundle = legacyPreview.bundle as AppDataBundle;
    validateBundleEnvelope(bundle);
    validateIndexedDBBundle(bundle);
    const indexedDB = bundle.indexedDB ?? {};
    return {
      ...legacyPreview,
      bundle,
      indexedDBCounts: Object.fromEntries(
        IDB_BUNDLE_KEYS.map((key) => [key, countValue(indexedDB[key])]),
      ),
    };
  }

  async importData(bundle: AppDataBundle, selectedKeys: string[]): Promise<{
    importedLocalStorageKeys: number;
    importedIndexedDBStores: number;
    indexedDBRecords: number;
    verifiedLocalStorageKeys: number;
    verifiedIndexedDBRecords: number;
    backupLocalStorageKeys: number;
    backupIndexedDBRecords: number;
  }> {
    validateBundleEnvelope(bundle);
    validateIndexedDBBundle(bundle);
    const batch = selectedIndexedDBBatch(bundle);
    const stores = Object.keys(batch) as StoreName[];
    const indexedDBRecords = Object.values(batch).reduce(
      (sum, records) => sum + (records?.length ?? 0),
      0,
    );
    await drainPendingWrites();
    const localStorageBackup = this.legacy.createBackup(selectedKeys);
    const indexedDBBackup = await snapshotStores(stores);
    const backupIndexedDBRecords = Object.values(indexedDBBackup).reduce(
      (sum, records) => sum + (records?.length ?? 0),
      0,
    );

    try {
      const importedLocalStorageKeys = this.legacy.importData(bundle, selectedKeys);
      if (stores.length > 0) {
        await this.restoreWriter(batch);
        clearCaches();
        await preloadAll();
      }
      const verifiedLocalStorageKeys = this.legacy.verifyData(bundle, selectedKeys);
      const verifiedIndexedDBRecords = await verifyStores(batch);

      return {
        importedLocalStorageKeys,
        importedIndexedDBStores: stores.length,
        indexedDBRecords,
        verifiedLocalStorageKeys,
        verifiedIndexedDBRecords,
        backupLocalStorageKeys: localStorageBackup.size,
        backupIndexedDBRecords,
      };
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      try {
        if (stores.length > 0) {
          await replaceStores(indexedDBBackup);
          clearCaches();
          await preloadAll();
          await verifyStores(indexedDBBackup);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      try {
        this.legacy.restoreBackup(localStorageBackup);
        this.legacy.verifyBackup(localStorageBackup);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }

      const causeMessage = error instanceof Error ? error.message : String(error);
      if (rollbackErrors.length > 0) {
        throw new AppDataRestoreError(
          `Restore failed: ${causeMessage}. Rollback could not be fully verified; current data state is unconfirmed.`,
          false,
        );
      }
      throw new AppDataRestoreError(
        `Restore failed: ${causeMessage}. Previous data was restored and verified.`,
        true,
      );
    }
  }
}
