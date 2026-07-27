import { beforeEach, describe, expect, it } from "vitest";
import type { Conversation } from "@/core/entities/conversation";
import type {
  ChatGPTShareSnapshotMetadata,
  ImportedSource,
} from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { ConversationVersionService } from "@/core/services/conversation-version-service";
import { prepareChatGPTShareSnapshot } from "@/core/services/chatgpt-share-snapshot-service";
import {
  ChatGPTShareSnapshotWorkflow,
  type ChatGPTShareSnapshotWorkflowStorages,
} from "@/core/services/chatgpt-share-snapshot-workflow";
import { AppDataStorage } from "@/infrastructure/storage/app-data-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserTaskStorage } from "@/infrastructure/storage/browser-task-storage";
import {
  closePalosDB,
  drainPendingWritesOrThrow,
  getPendingWriteCount,
  persistInBackground,
  putStores,
  readAll,
  replaceStores,
} from "@/infrastructure/storage/indexeddb/database";
import { IndexedDBConversationStorage } from "@/infrastructure/storage/indexeddb/idb-conversation-storage";
import { IndexedDBConversationVersionStorage } from "@/infrastructure/storage/indexeddb/idb-conversation-version-storage";
import { IndexedDBMessageStorage } from "@/infrastructure/storage/indexeddb/idb-message-storage";
import { IndexedDBRoundStorage } from "@/infrastructure/storage/indexeddb/idb-round-storage";
import { IndexedDBShareSnapshotCanonicalWriter } from "@/infrastructure/storage/indexeddb/idb-share-snapshot-canonical-writer";
import { IndexedDBSourceStorage } from "@/infrastructure/storage/indexeddb/idb-source-storage";
import {
  clearCaches,
  preloadAll,
} from "@/infrastructure/storage/indexeddb/preload";
import {
  executeShareSnapshotCanonicalOperation,
  type ShareSnapshotCanonicalPlan,
} from "@/infrastructure/storage/indexeddb/share-snapshot-operation";

type StoreData = Map<string, unknown>;

class FakeRequest<T = unknown> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class FakeOpenRequest extends FakeRequest<IDBDatabase> {
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null = null;
}

class AtomicFakeTransaction {
  error: DOMException | null = null;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private pending = 0;
  private completed = false;
  private readonly views = new Map<string, StoreData>();

  constructor(
    private readonly stores: Map<string, StoreData>,
    private readonly storeNames: string[],
    private readonly mode: IDBTransactionMode,
    private readonly fail: boolean,
  ) {
    for (const name of storeNames) {
      const stored = stores.get(name) ?? new Map<string, unknown>();
      stores.set(name, stored);
      this.views.set(
        name,
        mode === "readwrite" ? new Map(stored) : stored,
      );
    }
    this.completeSoon();
  }

  objectStore(name: string): IDBObjectStore {
    const data = this.views.get(name);
    if (!data) {
      throw new Error(`Store ${name} is not part of this transaction.`);
    }
    return new AtomicFakeObjectStore(data, this) as unknown as IDBObjectStore;
  }

  operation(): void {
    this.pending += 1;
  }

  operationDone(): void {
    this.pending -= 1;
    this.completeSoon();
  }

  private completeSoon(): void {
    queueMicrotask(() => {
      if (this.completed || this.pending > 0) return;
      this.completed = true;
      if (this.fail) {
        this.error = new DOMException("forced transaction failure", "AbortError");
        this.onabort?.();
        return;
      }
      if (this.mode === "readwrite") {
        for (const name of this.storeNames) {
          this.stores.set(name, this.views.get(name) as StoreData);
        }
      }
      this.oncomplete?.();
    });
  }
}

class AtomicFakeObjectStore {
  constructor(
    private readonly data: StoreData,
    private readonly transaction: AtomicFakeTransaction,
  ) {}

  getAll(): IDBRequest<unknown[]> {
    this.transaction.operation();
    const request = new FakeRequest<unknown[]>();
    queueMicrotask(() => {
      request.result = [...this.data.values()];
      request.onsuccess?.();
      this.transaction.operationDone();
    });
    return request as unknown as IDBRequest<unknown[]>;
  }

  put(record: { id: string }): IDBRequest {
    this.transaction.operation();
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.data.set(record.id, record);
      request.onsuccess?.();
      this.transaction.operationDone();
    });
    return request as unknown as IDBRequest;
  }

  delete(id: string): IDBRequest {
    this.transaction.operation();
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.data.delete(id);
      request.onsuccess?.();
      this.transaction.operationDone();
    });
    return request as unknown as IDBRequest;
  }

  clear(): IDBRequest {
    this.transaction.operation();
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.data.clear();
      request.onsuccess?.();
      this.transaction.operationDone();
    });
    return request as unknown as IDBRequest;
  }

  count(): IDBRequest<number> {
    this.transaction.operation();
    const request = new FakeRequest<number>();
    queueMicrotask(() => {
      request.result = this.data.size;
      request.onsuccess?.();
      this.transaction.operationDone();
    });
    return request as unknown as IDBRequest<number>;
  }
}

class AtomicFakeDatabase {
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };
  onclose: (() => void) | null = null;

  constructor(
    private readonly stores: Map<string, StoreData>,
    private readonly shouldFailReadwrite: () => boolean,
  ) {}

  createObjectStore(name: string): IDBObjectStore {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    return {} as IDBObjectStore;
  }

  transaction(
    storeNames: string | string[],
    mode: IDBTransactionMode = "readonly",
  ): IDBTransaction {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return new AtomicFakeTransaction(
      this.stores,
      names,
      mode,
      mode === "readwrite" && this.shouldFailReadwrite(),
    ) as unknown as IDBTransaction;
  }

  close(): void {
    this.onclose?.();
  }
}

class AtomicFakeIndexedDB {
  readonly stores = new Map<string, StoreData>();
  failReadwriteTransactions = 0;

  open(): IDBOpenDBRequest {
    const request = new FakeOpenRequest();
    const database = new AtomicFakeDatabase(this.stores, () => {
      if (this.failReadwriteTransactions === 0) return false;
      this.failReadwriteTransactions -= 1;
      return true;
    }) as unknown as IDBDatabase;
    queueMicrotask(() => {
      request.result = database;
      request.onupgradeneeded?.({
        target: request,
      } as unknown as IDBVersionChangeEvent);
      (
        request.onsuccess as unknown as ((event: Event) => void) | null
      )?.({ target: request } as unknown as Event);
    });
    return request as unknown as IDBOpenDBRequest;
  }
}

class FakeLocalStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

const now = "2026-07-27T00:00:00.000Z";
const later = "2026-07-27T01:00:00.000Z";
const conversationId = "share-conversation";
const sourceId = "share-source";
const resourceHash =
  "0f2e08f750e63fe2358752c452398948d3d05519a3b07e359b5ac2ee23e6464d";

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: conversationId,
    title: "Share Conversation",
    sourceType: "ChatGPT",
    note: "conversation note",
    summary: "overview summary",
    conclusion: "overview conclusion",
    pendingQuestions: "overview pending",
    context: {
      longTermBackground: "long-term context",
      currentState: "current context",
      decisions: "keep decisions",
      constraints: "keep constraints",
      nextActions: "keep next actions",
    },
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    ...overrides,
  };
}

function metadata(
  snapshotMessageCount: number,
  capturedAt = now,
  snapshotSequence = 1,
  previousSnapshotSourceId?: string,
): ChatGPTShareSnapshotMetadata {
  return {
    schemaVersion: 2,
    resourceHash,
    snapshotHash: `snapshot-${snapshotMessageCount}`,
    snapshotMessageCount,
    capturedAt,
    parserVersion: "1.0.0",
    inputKind: "pasted-text",
    hashAlgorithm: "sha256-json-role-content-v1",
    previousSnapshotSourceId,
    snapshotSequence,
  };
}

function source(
  snapshotMessageCount: number,
  overrides: Partial<ImportedSource> = {},
): ImportedSource {
  return {
    id: sourceId,
    conversationId,
    kind: "text",
    name: "ChatGPT Share Snapshot",
    content: "User:\nA\n\nAssistant:\nB",
    importedAt: now,
    updatedAt: now,
    shareSnapshot: metadata(snapshotMessageCount),
    ...overrides,
  };
}

function message(
  id: string,
  content: string,
  order: number,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId,
    role: order % 2 === 0 ? "user" : "assistant",
    content,
    order,
    createdAt: now,
    updatedAt: now,
    sourceId,
    sourceOrdinal: order,
    ...overrides,
  };
}

function round(
  id: string,
  messageIds: string[],
  order: number,
  overrides: Partial<Round> = {},
): Round {
  return {
    id,
    conversationId,
    order,
    title: id,
    question: "question",
    answer: "answer",
    messageIds,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function appendPlan(): ShareSnapshotCanonicalPlan {
  return {
    conversation: conversation({ updatedAt: later }),
    source: source(4, {
      id: "share-source-2",
      content:
        "User:\nA\n\nAssistant:\nB\n\nUser:\nC\n\nAssistant:\nD",
      importedAt: later,
      updatedAt: later,
      shareSnapshot: metadata(4, later, 2, sourceId),
    }),
    messages: [
      message("message-c", "C", 2, {
        createdAt: later,
        updatedAt: later,
        sourceId: "share-source-2",
      }),
      message("message-d", "D", 3, {
        createdAt: later,
        updatedAt: later,
        sourceId: "share-source-2",
      }),
    ],
    rounds: [
      round("round-new", ["message-c", "message-d"], 2, {
        title: "suffix round",
        question: "C",
        answer: "D",
        createdAt: later,
        updatedAt: later,
      }),
    ],
  };
}

async function seedShareWorkspace(): Promise<{
  oldMessages: Message[];
  oldRound: Round;
  knowledge: Record<string, unknown>;
}> {
  const oldMessages = [
    message("message-a", "A", 0),
    message("message-b", "B", 1),
  ];
  const oldRound = round("round-existing", oldMessages.map(({ id }) => id), 1, {
    note: "important note",
    summary: "summary",
    context: {
      inheritanceMode: "inherit",
      snapshot: { currentState: "context" },
      confirmedAt: now,
    },
  });
  const knowledge = {
    id: "knowledge-existing",
    proposalId: "proposal-snapshot",
    title: "existing",
    summary: "existing summary",
    content: "existing knowledge",
    status: "Active",
    createdAt: now,
    updatedAt: now,
  };
  await replaceStores({
    conversations: [conversation()],
    sources: [source(2)],
    messages: oldMessages,
    rounds: [oldRound],
    proposals: [],
    "knowledge-cards": [knowledge],
    "conversation-versions": [],
  });
  new BrowserTaskStorage().save({
    id: "task-existing",
    title: "existing task",
    status: "inbox",
    type: "todo",
    priority: "medium",
    sourceRef: {
      type: "conversation",
      entityId: conversationId,
      titleSnapshot: "Share Conversation",
    },
    createdAt: now,
    updatedAt: now,
  });
  return { oldMessages, oldRound, knowledge };
}

function indexedDBWorkflow(): ChatGPTShareSnapshotWorkflow {
  const storages: ChatGPTShareSnapshotWorkflowStorages = {
    conversations: new IndexedDBConversationStorage(),
    sources: new IndexedDBSourceStorage(),
    messages: new IndexedDBMessageStorage(),
    rounds: new IndexedDBRoundStorage(),
  };
  const ids = {
    message: 0,
    round: 0,
    source: 0,
  };
  let previewId = 0;
  return new ChatGPTShareSnapshotWorkflow(storages, {
    writer: new IndexedDBShareSnapshotCanonicalWriter(),
    createId(kind) {
      ids[kind] += 1;
      return `workflow-${kind}-${ids[kind]}`;
    },
    createPreviewId() {
      previewId += 1;
      return `workflow-preview-${previewId}`;
    },
    now: () => later,
  });
}

async function reloadIndexedDBStorages(): Promise<{
  conversations: IndexedDBConversationStorage;
  sources: IndexedDBSourceStorage;
  messages: IndexedDBMessageStorage;
  rounds: IndexedDBRoundStorage;
}> {
  clearCaches();
  await preloadAll();
  return {
    conversations: new IndexedDBConversationStorage(),
    sources: new IndexedDBSourceStorage(),
    messages: new IndexedDBMessageStorage(),
    rounds: new IndexedDBRoundStorage(),
  };
}

let fakeIndexedDB: AtomicFakeIndexedDB;
let localStorage: FakeLocalStorage;

beforeEach(async () => {
  closePalosDB();
  clearCaches();
  fakeIndexedDB = new AtomicFakeIndexedDB();
  localStorage = new FakeLocalStorage();
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: fakeIndexedDB,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      dispatchEvent: () => true,
    },
  });
  await preloadAll();
});

describe("Share Snapshot optional-field compatibility", () => {
  it("round-trips provenance through BrowserStorage and reads legacy records", () => {
    const messages = new BrowserMessageStorage();
    const sources = new BrowserSourceStorage();
    const withProvenance = message("browser-new", "new", 0);
    const legacyMessage = message("browser-old", "old", 1, {
      sourceId: undefined,
      sourceOrdinal: undefined,
    });
    const shareSource = source(1);
    const legacySource = source(0, {
      id: "legacy-source",
      shareSnapshot: undefined,
    });

    messages.saveMany([withProvenance, legacyMessage]);
    sources.save(shareSource);
    sources.save(legacySource);

    expect(messages.getAll().find(({ id }) => id === withProvenance.id)).toEqual(
      withProvenance,
    );
    const reloadedLegacyMessage = messages
      .getAll()
      .find(({ id }) => id === legacyMessage.id);
    expect(reloadedLegacyMessage?.sourceId).toBeUndefined();
    expect(reloadedLegacyMessage?.sourceOrdinal).toBeUndefined();
    expect(sources.getAll().find(({ id }) => id === shareSource.id)).toEqual(
      shareSource,
    );
    expect(
      sources.getAll().find(({ id }) => id === legacySource.id)?.shareSnapshot,
    ).toBeUndefined();
  });

  it("round-trips provenance through IndexedDB and reads legacy records", async () => {
    const withProvenance = message("idb-new", "new", 0);
    const legacyMessage = message("idb-old", "old", 1, {
      sourceId: undefined,
      sourceOrdinal: undefined,
    });
    const shareSource = source(1);
    const legacySource = source(0, {
      id: "legacy-source",
      shareSnapshot: undefined,
    });
    await replaceStores({
      messages: [withProvenance, legacyMessage],
      sources: [shareSource, legacySource],
    });
    clearCaches();
    await preloadAll();

    expect(new IndexedDBMessageStorage().getAll()).toEqual(
      expect.arrayContaining([withProvenance, legacyMessage]),
    );
    expect(new IndexedDBSourceStorage().getAll()).toEqual(
      expect.arrayContaining([shareSource, legacySource]),
    );
  });

  it("preserves provenance in Conversation Version snapshots", async () => {
    const conversations = new IndexedDBConversationStorage();
    const messages = new IndexedDBMessageStorage();
    const versions = new IndexedDBConversationVersionStorage();
    conversations.save(conversation());
    messages.saveMany([
      message("version-new", "new", 0),
      message("version-old", "old", 1, {
        sourceId: undefined,
        sourceOrdinal: undefined,
      }),
    ]);
    const version = new ConversationVersionService({
      conversations,
      messages,
      versions,
    }).createSnapshot(conversationId, "provenance", "");
    expect(version).not.toBeNull();
    await drainPendingWritesOrThrow();
    clearCaches();
    await preloadAll();

    const reloaded = new IndexedDBConversationVersionStorage()
      .getByConversationId(conversationId)
      .find(({ id }) => id === version?.id);
    expect(reloaded?.snapshotData.messages[0]).toMatchObject({
      sourceId,
      sourceOrdinal: 0,
    });
    expect(reloaded?.snapshotData.messages[1].sourceId).toBeUndefined();
    expect(reloaded?.snapshotData.messages[1].sourceOrdinal).toBeUndefined();
  });

  it("preserves optional fields through App Data export/import", async () => {
    const versionMessage = message("app-message", "app", 0);
    const appSource = source(1);
    await replaceStores({
      conversations: [conversation()],
      sources: [appSource],
      messages: [versionMessage],
      rounds: [round("app-round", [versionMessage.id], 1)],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [
        {
          id: "app-version",
          conversationId,
          name: "app version",
          description: "",
          createdAt: now,
          sourceVersion: 1,
          messageCount: 1,
          snapshotData: {
            conversation: conversation(),
            messages: [versionMessage],
          },
        },
      ],
    });
    const storage = new AppDataStorage();
    const bundle = await storage.exportData();
    expect(bundle.schemaVersion).toBe(1);

    await replaceStores({
      conversations: [],
      sources: [],
      messages: [],
      rounds: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });
    clearCaches();
    await preloadAll();
    await storage.importData(bundle, []);

    expect((await readAll<Message>("messages"))[0]).toMatchObject({
      sourceId,
      sourceOrdinal: 0,
    });
    expect((await readAll<ImportedSource>("sources"))[0].shareSnapshot).toEqual(
      appSource.shareSnapshot,
    );
    expect(
      (
        await readAll<{
          snapshotData: { messages: Message[] };
        }>("conversation-versions")
      )[0].snapshotData.messages[0],
    ).toMatchObject({
      sourceId,
      sourceOrdinal: 0,
    });
  });
});

describe("putStores", () => {
  it("puts one store without replacing existing data", async () => {
    const original = message("original", "original", 0);
    const appended = message("appended", "appended", 1);
    await replaceStores({ messages: [original] });

    await putStores({ messages: [appended] });

    expect(await readAll<Message>("messages")).toEqual([original, appended]);
    expect(getPendingWriteCount()).toBe(0);
  });

  it("puts Conversation, Source, Message, and Round in one transaction", async () => {
    const storedMessage = message("multi-message", "multi", 0);
    await putStores({
      conversations: [conversation()],
      sources: [source(1)],
      messages: [storedMessage],
      rounds: [round("multi-round", [storedMessage.id], 1)],
    });

    expect(await readAll<Conversation>("conversations")).toHaveLength(1);
    expect(await readAll<ImportedSource>("sources")).toHaveLength(1);
    expect(await readAll<Message>("messages")).toHaveLength(1);
    expect(await readAll<Round>("rounds")).toHaveLength(1);
    expect(getPendingWriteCount()).toBe(0);
  });

  it("rolls back every store and preserves original records on abort", async () => {
    const originalConversation = conversation();
    const originalSource = source(2);
    const originalMessages = [
      message("message-a", "A", 0),
      message("message-b", "B", 1),
    ];
    const originalRound = round(
      "round-existing",
      originalMessages.map(({ id }) => id),
      1,
    );
    await replaceStores({
      conversations: [originalConversation],
      sources: [originalSource],
      messages: originalMessages,
      rounds: [originalRound],
    });
    fakeIndexedDB.failReadwriteTransactions = 1;

    await expect(
      putStores({
        conversations: [conversation({ updatedAt: later })],
        sources: [source(3, { updatedAt: later })],
        messages: [message("message-c", "C", 2)],
        rounds: [round("round-new", ["message-c"], 2)],
      }),
    ).rejects.toThrow("forced transaction failure");

    expect(await readAll<Conversation>("conversations")).toEqual([
      originalConversation,
    ]);
    expect(await readAll<ImportedSource>("sources")).toEqual([originalSource]);
    expect(await readAll<Message>("messages")).toEqual(originalMessages);
    expect(await readAll<Round>("rounds")).toEqual([originalRound]);
    expect(getPendingWriteCount()).toBe(0);
  });
});

describe("Share Snapshot canonical operation", () => {
  it("accepts the pure service initial plan through durable verification", async () => {
    const ids = {
      message: 0,
      round: 0,
      source: 0,
    };
    const preparation = await prepareChatGPTShareSnapshot({
      shareUrl: "https://chatgpt.com/share/12345678-abcd",
      snapshot: {
        kind: "pasted-text",
        content: "User:\nA\n\nAssistant:\nB",
      },
      capturedAt: now,
      target: {
        kind: "new",
        conversation: conversation(),
      },
      createId(kind) {
        ids[kind] += 1;
        return `initial-${kind}-${ids[kind]}`;
      },
    });

    expect(preparation.status).toBe("new");
    expect(preparation.canonicalPlan).toBeDefined();
    const result = await executeShareSnapshotCanonicalOperation(
      preparation.canonicalPlan!,
    );

    expect(result.verification).toMatchObject({
      messageCount: 2,
      roundCount: 1,
      sourceMessageCount: 2,
      pendingWriteCount: 0,
    });
    expect(await readAll<Conversation>("conversations")).toHaveLength(1);
    expect(await readAll<ImportedSource>("sources")).toEqual([
      expect.objectContaining({
        id: "initial-source-1",
        conversationId,
        shareSnapshot: expect.objectContaining({ snapshotMessageCount: 2 }),
      }),
    ]);
    expect((await readAll<Message>("messages")).map(({ id }) => id)).toEqual([
      "initial-message-1",
      "initial-message-2",
    ]);
    expect((await readAll<Round>("rounds")).map(({ id }) => id)).toEqual([
      "initial-round-1",
    ]);
  });

  it("accepts the pure service append plan through durable verification", async () => {
    await seedShareWorkspace();
    const [storedConversation] = await readAll<Conversation>("conversations");
    const [storedSource] = await readAll<ImportedSource>("sources");
    const storedMessages = await readAll<Message>("messages");
    const storedRounds = await readAll<Round>("rounds");
    const ids = {
      message: 0,
      round: 0,
      source: 0,
    };
    const preparation = await prepareChatGPTShareSnapshot({
      shareUrl: "https://chatgpt.com/share/12345678-abcd",
      snapshot: {
        kind: "pasted-text",
        content:
          "User:\nA\n\nAssistant:\nB\n\nUser:\nC\n\nAssistant:\nD",
      },
      capturedAt: later,
      target: {
        kind: "existing",
        conversation: storedConversation,
        source: storedSource,
        messages: storedMessages,
        rounds: storedRounds,
      },
      createId(kind) {
        ids[kind] += 1;
        return `service-${kind}-${ids[kind]}`;
      },
    });

    expect(preparation.status).toBe("append");
    expect(preparation.canonicalPlan).toBeDefined();
    const result = await executeShareSnapshotCanonicalOperation(
      preparation.canonicalPlan!,
    );

    expect(result.verification).toMatchObject({
      messageCount: 4,
      roundCount: 2,
      sourceMessageCount: 4,
      pendingWriteCount: 0,
    });
    expect(
      (await readAll<Message>("messages")).map(({ id }) => id),
    ).toEqual([
      "message-a",
      "message-b",
      "service-message-1",
      "service-message-2",
    ]);
    expect((await readAll<Round>("rounds")).map(({ id }) => id)).toEqual([
      "round-existing",
      "service-round-1",
    ]);
    const storedSources = await readAll<ImportedSource>("sources");
    expect(storedSources).toHaveLength(2);
    expect(storedSources.find(({ id }) => id === sourceId)).toEqual(
      storedSource,
    );
    expect(
      storedSources.find(({ id }) => id === "service-source-1")
        ?.shareSnapshot,
    ).toMatchObject({
      previousSnapshotSourceId: sourceId,
      snapshotSequence: 2,
      snapshotMessageCount: 4,
    });
  });

  it("drains pending writes, appends canonically, reloads, and preserves enrichment", async () => {
    const { oldMessages, oldRound, knowledge } = await seedShareWorkspace();
    let releasePendingWrite: (() => void) | undefined;
    const pendingWrite = new Promise<void>((resolve) => {
      releasePendingWrite = resolve;
    });
    persistInBackground("test pending write", pendingWrite);
    const operation = executeShareSnapshotCanonicalOperation(appendPlan());
    await Promise.resolve();

    expect(getPendingWriteCount()).toBe(1);
    expect(await readAll<Message>("messages")).toEqual(oldMessages);
    releasePendingWrite?.();
    const result = await operation;

    expect(result.written).toEqual({
      conversations: 1,
      sources: 1,
      messages: 2,
      rounds: 1,
    });
    expect(result.verification).toMatchObject({
      messageCount: 4,
      roundCount: 2,
      sourceMessageCount: 4,
      sourceMetadataVerified: true,
      sourceLineageVerified: true,
      referencesVerified: true,
      pendingWriteCount: 0,
    });

    const reloadedMessages = await readAll<Message>("messages");
    const reloadedRounds = await readAll<Round>("rounds");
    const reloadedConversation = (
      await readAll<Conversation>("conversations")
    )[0];
    const reloadedSources = await readAll<ImportedSource>("sources");
    const reloadedSource = reloadedSources.find(
      ({ id }) => id === "share-source-2",
    );
    expect(reloadedMessages.map(({ id }) => id)).toEqual([
      "message-a",
      "message-b",
      "message-c",
      "message-d",
    ]);
    expect(reloadedMessages.slice(0, 2)).toEqual(oldMessages);
    expect(reloadedRounds.find(({ id }) => id === oldRound.id)).toEqual(
      oldRound,
    );
    expect(reloadedConversation).toMatchObject({
      note: "conversation note",
      summary: "overview summary",
      conclusion: "overview conclusion",
      pendingQuestions: "overview pending",
      context: conversation().context,
    });
    expect(reloadedSources.find(({ id }) => id === sourceId)).toEqual(
      source(2),
    );
    expect(reloadedSource?.shareSnapshot).toEqual(
      metadata(4, later, 2, sourceId),
    );
    expect(reloadedSource?.content).not.toMatch(/<script|<html|cookie/i);
    expect(await readAll("knowledge-cards")).toEqual([knowledge]);
    expect(new BrowserTaskStorage().getById("task-existing")).toMatchObject({
      title: "existing task",
      sourceRef: { entityId: conversationId },
    });

    clearCaches();
    await preloadAll();
    expect(
      new IndexedDBMessageStorage().getByConversationId(conversationId),
    ).toHaveLength(4);
    expect(getPendingWriteCount()).toBe(0);
  });

  it("rejects invalid source lineage before writing", async () => {
    const { oldMessages } = await seedShareWorkspace();
    const plan = appendPlan();
    const invalidPlan: ShareSnapshotCanonicalPlan = {
      ...plan,
      messages: [
        message("message-c", "C", 3, { sourceId: "share-source-2" }),
        message("message-d", "D", 4, { sourceId: "share-source-2" }),
      ],
    };

    await expect(
      executeShareSnapshotCanonicalOperation(invalidPlan),
    ).rejects.toThrow("missing sourceOrdinal 2");

    expect(await readAll<Message>("messages")).toEqual(oldMessages);
    expect(await readAll<Round>("rounds")).toHaveLength(1);
    expect(getPendingWriteCount()).toBe(0);
  });

  it("rolls back the complete Share Snapshot write on transaction abort", async () => {
    const { oldMessages, oldRound, knowledge } = await seedShareWorkspace();
    const originalConversation = await readAll<Conversation>("conversations");
    const originalSources = await readAll<ImportedSource>("sources");
    fakeIndexedDB.failReadwriteTransactions = 1;

    await expect(
      executeShareSnapshotCanonicalOperation(appendPlan()),
    ).rejects.toThrow("forced transaction failure");

    expect(await readAll<Conversation>("conversations")).toEqual(
      originalConversation,
    );
    expect(await readAll<ImportedSource>("sources")).toEqual(originalSources);
    expect(await readAll<Message>("messages")).toEqual(oldMessages);
    expect(await readAll<Round>("rounds")).toEqual([oldRound]);
    expect(await readAll("knowledge-cards")).toEqual([knowledge]);
    expect(new BrowserTaskStorage().getById("task-existing")).not.toBeNull();
    expect(getPendingWriteCount()).toBe(0);
  });
});

describe("Share Snapshot IndexedDB workflow integration", () => {
  it("confirms a new preview through the writer and reload verification", async () => {
    const workflow = indexedDBWorkflow();
    const preview = await workflow.preview({
      shareUrl: "https://chatgpt.com/share/12345678-abcd",
      snapshot: {
        kind: "pasted-text",
        content: "User:\nA\n\nAssistant:\nB",
      },
      newConversation: conversation(),
    });

    expect(preview).toMatchObject({
      status: "new",
      confirmable: true,
      summary: { newMessageCount: 2, newRoundCount: 1 },
    });
    expect(await readAll("conversations")).toEqual([]);

    const result = await workflow.confirm({
      previewId: preview.previewId,
      baselineFingerprint: preview.baselineFingerprint as string,
    });

    expect(result).toMatchObject({
      status: "success",
      mode: "new",
      receipt: {
        writtenMessageCount: 2,
        writtenRoundCount: 1,
        verifiedMessageCount: 2,
        verifiedRoundCount: 1,
        pendingWriteCount: 0,
      },
    });
    const reloaded = await reloadIndexedDBStorages();
    expect(reloaded.conversations.getById(conversationId)).not.toBeNull();
    expect(reloaded.sources.getAll()).toEqual([
      expect.objectContaining({
        id: "workflow-source-1",
        conversationId,
        shareSnapshot: expect.objectContaining({ snapshotMessageCount: 2 }),
      }),
    ]);
    expect(
      reloaded.messages
        .getByConversationId(conversationId)
        .map(({ sourceOrdinal }) => sourceOrdinal),
    ).toEqual([0, 1]);
    expect(reloaded.rounds.getByConversationId(conversationId)).toHaveLength(1);
    expect(getPendingWriteCount()).toBe(0);

    const duplicate = await workflow.confirm({
      previewId: preview.previewId,
      baselineFingerprint: preview.baselineFingerprint as string,
    });
    expect(duplicate.status).toBe("stale");
    expect(await readAll<Message>("messages")).toHaveLength(2);
  });

  it("confirms append through the writer and preserves records after reload", async () => {
    const { oldMessages, oldRound } = await seedShareWorkspace();
    await reloadIndexedDBStorages();
    const workflow = indexedDBWorkflow();
    const preview = await workflow.preview({
      shareUrl: "https://chatgpt.com/share/12345678-abcd",
      snapshot: {
        kind: "pasted-text",
        content:
          "User:\nA\n\nAssistant:\nB\n\nUser:\nC\n\nAssistant:\nD",
      },
      newConversation: conversation({ id: "unused-new-conversation" }),
    });

    expect(preview).toMatchObject({
      status: "append",
      target: { kind: "existing", conversationId, sourceId },
      summary: { newMessageCount: 2, newRoundCount: 1 },
      confirmable: true,
    });
    const result = await workflow.confirm({
      previewId: preview.previewId,
      baselineFingerprint: preview.baselineFingerprint as string,
    });

    expect(result).toMatchObject({
      status: "success",
      mode: "append",
      receipt: {
        writtenMessageCount: 2,
        writtenRoundCount: 1,
        verifiedMessageCount: 4,
        verifiedRoundCount: 2,
        pendingWriteCount: 0,
      },
    });
    const reloaded = await reloadIndexedDBStorages();
    expect(
      reloaded.messages.getByConversationId(conversationId).slice(0, 2),
    ).toEqual(oldMessages);
    expect(reloaded.rounds.getById(oldRound.id)).toEqual(oldRound);
    expect(reloaded.conversations.getById(conversationId)).toMatchObject({
      note: "conversation note",
      summary: "overview summary",
      conclusion: "overview conclusion",
      pendingQuestions: "overview pending",
      context: conversation().context,
    });
    expect(reloaded.sources.getAll()).toHaveLength(2);
    expect(
      reloaded.sources
        .getAll()
        .find(({ id }) => id !== sourceId)
        ?.shareSnapshot,
    ).toMatchObject({
      snapshotMessageCount: 4,
      capturedAt: later,
      previousSnapshotSourceId: sourceId,
      snapshotSequence: 2,
    });
  });

  it("detects durable stale state in the writer adapter before canonical write", async () => {
    const { oldMessages, oldRound } = await seedShareWorkspace();
    await reloadIndexedDBStorages();
    const workflow = indexedDBWorkflow();
    const preview = await workflow.preview({
      shareUrl: "https://chatgpt.com/share/12345678-abcd",
      snapshot: {
        kind: "pasted-text",
        content:
          "User:\nA\n\nAssistant:\nB\n\nUser:\nC\n\nAssistant:\nD",
      },
      newConversation: conversation({ id: "unused-new-conversation" }),
    });
    await putStores({
      conversations: [
        conversation({
          note: "durably changed after preview",
          updatedAt: later,
        }),
      ],
    });

    const result = await workflow.confirm({
      previewId: preview.previewId,
      baselineFingerprint: preview.baselineFingerprint as string,
    });

    expect(result.status).toBe("stale");
    expect(await readAll<Message>("messages")).toEqual(oldMessages);
    expect(await readAll<Round>("rounds")).toEqual([oldRound]);
    expect((await readAll<Conversation>("conversations"))[0].note).toBe(
      "durably changed after preview",
    );
    expect(getPendingWriteCount()).toBe(0);
  });

  it("returns typed write-failed and preserves all stores on transaction abort", async () => {
    const { oldMessages, oldRound } = await seedShareWorkspace();
    await reloadIndexedDBStorages();
    const originalConversation = await readAll<Conversation>("conversations");
    const originalSource = await readAll<ImportedSource>("sources");
    const workflow = indexedDBWorkflow();
    const preview = await workflow.preview({
      shareUrl: "https://chatgpt.com/share/12345678-abcd",
      snapshot: {
        kind: "pasted-text",
        content:
          "User:\nA\n\nAssistant:\nB\n\nUser:\nC\n\nAssistant:\nD",
      },
      newConversation: conversation({ id: "unused-new-conversation" }),
    });
    fakeIndexedDB.failReadwriteTransactions = 1;

    const result = await workflow.confirm({
      previewId: preview.previewId,
      baselineFingerprint: preview.baselineFingerprint as string,
    });

    expect(result).toEqual({
      status: "write-failed",
      previewId: preview.previewId,
      message: "Share Snapshot canonical write failed.",
    });
    expect(await readAll<Conversation>("conversations")).toEqual(
      originalConversation,
    );
    expect(await readAll<ImportedSource>("sources")).toEqual(originalSource);
    expect(await readAll<Message>("messages")).toEqual(oldMessages);
    expect(await readAll<Round>("rounds")).toEqual([oldRound]);
    expect(getPendingWriteCount()).toBe(0);
  });
});
