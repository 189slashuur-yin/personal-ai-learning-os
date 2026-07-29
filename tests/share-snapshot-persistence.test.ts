import { beforeEach, describe, expect, it } from "vitest";
import type { Conversation } from "@/core/entities/conversation";
import type {
  ChatGPTShareSnapshotMetadata,
  ImportedSource,
} from "@/core/entities/imported-source";
import { isChatGPTShareSnapshotMetadata } from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { shareSnapshotTargetSelectionError } from "@/app/import/chatgpt-share-snapshot-import";
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
import {
  createPhase2FIndexedDBWorkflow,
  loadPhase2FSavedHtml,
  PHASE_2F_CONVERSATION_ID,
  PHASE_2F_DIFFERENT_SHARE_URL,
  PHASE_2F_SHARE_URL,
  phase2FConversation,
} from "./helpers/share-snapshot-validation";

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
    private readonly onTransaction: (
      storeNames: readonly string[],
      mode: IDBTransactionMode,
    ) => void,
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
    this.onTransaction(names, mode);
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
  readonly transactions: Array<{
    storeNames: readonly string[];
    mode: IDBTransactionMode;
  }> = [];
  failReadwriteTransactions = 0;

  open(): IDBOpenDBRequest {
    const request = new FakeOpenRequest();
    const database = new AtomicFakeDatabase(this.stores, () => {
      if (this.failReadwriteTransactions === 0) return false;
      this.failReadwriteTransactions -= 1;
      return true;
    }, (storeNames, mode) => {
      this.transactions.push({ storeNames: [...storeNames], mode });
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

function assistantExtensionFixture(): {
  storedSource: ImportedSource;
  storedMessages: Message[];
  storedRounds: Round[];
  plan: ShareSnapshotCanonicalPlan;
} {
  const storedSource = source(3, {
    content: "User:\nA\n\nAssistant:\nB\n\nUser:\nC",
  });
  const storedMessages = [
    message("message-a", "A", 0),
    message("message-b", "B", 1),
    message("message-c", "C", 2),
  ];
  const storedRounds = [
    round("round-existing", ["message-a", "message-b"], 1, {
      question: "A",
      answer: "B",
    }),
    round("round-tail", ["message-c"], 2, {
      title: "Preserved title",
      question: "C",
      answer: "",
      note: "preserved note",
      summary: "preserved summary",
      context: {
        inheritanceMode: "inherit",
        snapshot: { currentState: "preserved context" },
        confirmedAt: now,
      },
    }),
  ];
  return {
    storedSource,
    storedMessages,
    storedRounds,
    plan: {
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
        message("message-d", "D", 3, {
          createdAt: later,
          updatedAt: later,
          sourceId: "share-source-2",
        }),
      ],
      rounds: [
        {
          ...storedRounds[1],
          answer: "D",
          messageIds: ["message-c", "message-d"],
          updatedAt: later,
        },
      ],
    },
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

  it("keeps initial Assistant-only Round derivation outside append semantics", async () => {
    const preparation = await prepareChatGPTShareSnapshot({
      shareUrl: "https://chatgpt.com/share/12345678-abcd",
      snapshot: {
        kind: "pasted-text",
        content: "Assistant:\nInitial assistant context",
      },
      capturedAt: now,
      target: {
        kind: "new",
        conversation: conversation(),
      },
      createId(kind) {
        return `assistant-initial-${kind}`;
      },
    });

    expect(preparation).toMatchObject({
      status: "new",
      canonicalPlan: {
        rounds: [
          {
            id: "assistant-initial-round",
            question: "",
            answer: "Initial assistant context",
          },
        ],
      },
    });
    const result = await executeShareSnapshotCanonicalOperation(
      preparation.canonicalPlan!,
    );

    expect(result.verification).toMatchObject({
      messageCount: 1,
      roundCount: 1,
      pendingWriteCount: 0,
    });
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

  it("persists an assistant-only delta by extending the existing tail Round", async () => {
    const storedMessages = [
      message("message-a", "A", 0),
      message("message-b", "B", 1),
      message("message-c", "C", 2),
    ];
    const firstRound = round(
      "round-existing",
      ["message-a", "message-b"],
      1,
      {
        question: "A",
        answer: "B",
      },
    );
    const tailRound = round("round-tail", ["message-c"], 2, {
      title: "Preserved title",
      question: "C",
      answer: "",
      note: "preserved note",
      summary: "preserved summary",
      context: {
        inheritanceMode: "inherit",
        snapshot: { currentState: "preserved context" },
        confirmedAt: now,
      },
    });
    const storedSource = source(3, {
      content: "User:\nA\n\nAssistant:\nB\n\nUser:\nC",
    });
    await replaceStores({
      conversations: [conversation()],
      sources: [storedSource],
      messages: storedMessages,
      rounds: [firstRound, tailRound],
    });
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
        conversation: conversation(),
        source: storedSource,
        messages: storedMessages,
        rounds: [firstRound, tailRound],
      },
      createId(kind) {
        return `delta-${kind}`;
      },
    });

    expect(preparation).toMatchObject({
      status: "append",
      importPlan: { importedMessageCount: 1, importedRoundCount: 0 },
      canonicalPlan: {
        messages: [{ id: "delta-message", sourceOrdinal: 3 }],
        rounds: [
          {
            id: tailRound.id,
            answer: "D",
            messageIds: ["message-c", "delta-message"],
          },
        ],
      },
    });
    fakeIndexedDB.transactions.length = 0;
    const result = await executeShareSnapshotCanonicalOperation(
      preparation.canonicalPlan!,
    );

    expect(result.verification).toMatchObject({
      messageCount: 4,
      roundCount: 2,
      sourceMessageCount: 4,
      sourceMetadataVerified: true,
      sourceLineageVerified: true,
      messageOwnershipVerified: true,
      referencesVerified: true,
      immutableRecordsPreserved: true,
      roundExtensionPreserved: true,
      pendingWriteCount: 0,
    });
    expect(
      fakeIndexedDB.transactions.filter(({ mode }) => mode === "readwrite"),
    ).toEqual([
      {
        storeNames: ["conversations", "sources", "messages", "rounds"],
        mode: "readwrite",
      },
    ]);
    expect(
      (await readAll<Round>("rounds")).find(
        ({ id }) => id === tailRound.id,
      ),
    ).toEqual({
      ...tailRound,
      answer: "D",
      messageIds: ["message-c", "delta-message"],
      updatedAt: later,
    });
    expect(
      (await readAll<ImportedSource>("sources")).find(
        ({ id }) => id === sourceId,
      ),
    ).toEqual(storedSource);
    expect(await readAll<ImportedSource>("sources")).toHaveLength(2);
    expect(
      (await readAll<ImportedSource>("sources")).find(
        ({ id }) => id === "delta-source",
      )?.shareSnapshot,
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
    ).rejects.toThrow("does not continue canonical order and sourceOrdinal");

    expect(await readAll<Message>("messages")).toEqual(oldMessages);
    expect(await readAll<Round>("rounds")).toHaveLength(1);
    expect(getPendingWriteCount()).toBe(0);
  });

  it("rejects a plan that would rewrite an existing Message provenance", async () => {
    const { oldMessages } = await seedShareWorkspace();
    const originalSources = await readAll<ImportedSource>("sources");
    const plan = appendPlan();
    const invalidPlan: ShareSnapshotCanonicalPlan = {
      ...plan,
      messages: [
        { ...plan.messages[0], id: "message-a" },
        plan.messages[1],
      ],
    };

    await expect(
      executeShareSnapshotCanonicalOperation(invalidPlan),
    ).rejects.toThrow("cannot rewrite existing Message message-a");

    expect(await readAll<Message>("messages")).toEqual(oldMessages);
    expect(await readAll<ImportedSource>("sources")).toEqual(originalSources);
  });

  it("rejects duplicate Snapshot heads before the transaction", async () => {
    const { oldMessages, oldRound } = await seedShareWorkspace();
    const originalSources = await readAll<ImportedSource>("sources");
    const plan = appendPlan();
    const invalidPlan: ShareSnapshotCanonicalPlan = {
      ...plan,
      source: {
        ...plan.source,
        shareSnapshot: metadata(4, later, 1),
      },
    };

    await expect(
      executeShareSnapshotCanonicalOperation(invalidPlan),
    ).rejects.toThrow("would create a duplicate head");

    expect(await readAll<ImportedSource>("sources")).toEqual(originalSources);
    expect(await readAll<Message>("messages")).toEqual(oldMessages);
    expect(await readAll<Round>("rounds")).toEqual([oldRound]);
  });

  it("rejects an incorrect sequence or missing previous Snapshot Source", async () => {
    const { oldMessages } = await seedShareWorkspace();
    const plan = appendPlan();
    const wrongSequence: ShareSnapshotCanonicalPlan = {
      ...plan,
      source: {
        ...plan.source,
        shareSnapshot: metadata(4, later, 3, sourceId),
      },
    };
    const missingPrevious: ShareSnapshotCanonicalPlan = {
      ...plan,
      source: {
        ...plan.source,
        shareSnapshot: metadata(4, later, 2, "missing-source"),
      },
    };

    await expect(
      executeShareSnapshotCanonicalOperation(wrongSequence),
    ).rejects.toThrow("expected 2");
    await expect(
      executeShareSnapshotCanonicalOperation(missingPrevious),
    ).rejects.toThrow("previous source missing-source does not exist");

    expect(await readAll<Message>("messages")).toEqual(oldMessages);
    expect(await readAll<ImportedSource>("sources")).toHaveLength(1);
  });

  it("rejects a Round extension that changes preserved context fields", async () => {
    const fixture = assistantExtensionFixture();
    await replaceStores({
      conversations: [conversation()],
      sources: [fixture.storedSource],
      messages: fixture.storedMessages,
      rounds: fixture.storedRounds,
    });
    const originalRounds = await readAll<Round>("rounds");
    const invalidPlan: ShareSnapshotCanonicalPlan = {
      ...fixture.plan,
      rounds: fixture.plan.rounds.map((candidate) => ({
        ...candidate,
        note: "rewritten note",
        summary: "rewritten summary",
        context: {
          inheritanceMode: "exclude",
        },
      })),
    };

    await expect(
      executeShareSnapshotCanonicalOperation(invalidPlan),
    ).rejects.toThrow("changed preserved fields");

    expect(await readAll<Round>("rounds")).toEqual(originalRounds);
    expect(await readAll<Message>("messages")).toEqual(
      fixture.storedMessages,
    );
    expect(await readAll<ImportedSource>("sources")).toEqual([
      fixture.storedSource,
    ]);
  });

  it("rejects a Round extension whose persisted tail baseline has changed", async () => {
    const fixture = assistantExtensionFixture();
    const changedRounds = fixture.storedRounds.map((candidate) =>
      candidate.id === "round-tail"
        ? { ...candidate, question: "Locally changed question" }
        : candidate,
    );
    await replaceStores({
      conversations: [conversation()],
      sources: [fixture.storedSource],
      messages: fixture.storedMessages,
      rounds: changedRounds,
    });

    await expect(
      executeShareSnapshotCanonicalOperation(fixture.plan),
    ).rejects.toThrow("baseline does not match the canonical tail");

    expect(await readAll<Round>("rounds")).toEqual(changedRounds);
    expect(await readAll<Message>("messages")).toEqual(
      fixture.storedMessages,
    );
  });

  it("rolls back Source, Message, Round extension, and Conversation on abort", async () => {
    const fixture = assistantExtensionFixture();
    const storedConversation = conversation();
    await replaceStores({
      conversations: [storedConversation],
      sources: [fixture.storedSource],
      messages: fixture.storedMessages,
      rounds: fixture.storedRounds,
    });
    fakeIndexedDB.failReadwriteTransactions = 1;

    await expect(
      executeShareSnapshotCanonicalOperation(fixture.plan),
    ).rejects.toThrow("forced transaction failure");

    expect(await readAll<Conversation>("conversations")).toEqual([
      storedConversation,
    ]);
    expect(await readAll<ImportedSource>("sources")).toEqual([
      fixture.storedSource,
    ]);
    expect(await readAll<Message>("messages")).toEqual(
      fixture.storedMessages,
    );
    expect(await readAll<Round>("rounds")).toEqual(fixture.storedRounds);
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

describe("Phase 2F saved HTML to canonical storage validation", () => {
  it("creates canonical Source, Messages, and Rounds from a saved ChatGPT share page", async () => {
    const workflow = createPhase2FIndexedDBWorkflow();
    const preview = await workflow.preview({
      shareUrl: PHASE_2F_SHARE_URL,
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-initial.html",
      ),
      newConversation: phase2FConversation(),
    });

    expect(preview).toMatchObject({
      status: "new",
      confirmable: true,
      summary: {
        existingMessageCount: 0,
        snapshotMessageCount: 3,
        newMessageCount: 3,
        existingRoundCount: 0,
        newRoundCount: 2,
      },
    });
    expect(await readAll("conversations")).toEqual([]);
    expect(await readAll("sources")).toEqual([]);

    const result = await workflow.confirm({
      previewId: preview.previewId,
      baselineFingerprint: preview.baselineFingerprint as string,
    });

    expect(result).toMatchObject({
      status: "success",
      mode: "new",
      receipt: {
        writtenMessageCount: 3,
        writtenRoundCount: 2,
        verifiedMessageCount: 3,
        verifiedRoundCount: 2,
        pendingWriteCount: 0,
      },
    });

    const reloaded = await reloadIndexedDBStorages();
    const persistedConversation = reloaded.conversations.getById(
      PHASE_2F_CONVERSATION_ID,
    );
    const sources = reloaded.sources.getAll();
    const messages = reloaded.messages.getByConversationId(
      PHASE_2F_CONVERSATION_ID,
    );
    const rounds = reloaded.rounds.getByConversationId(
      PHASE_2F_CONVERSATION_ID,
    );

    expect(persistedConversation).toMatchObject({
      id: PHASE_2F_CONVERSATION_ID,
      title: "Phase 2F saved HTML validation",
      sourceType: "ChatGPT",
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      id: "phase-2f-source-1",
      conversationId: PHASE_2F_CONVERSATION_ID,
      name: "PALOS Snapshot Validation",
      shareSnapshot: {
        schemaVersion: 2,
        snapshotMessageCount: 3,
        inputKind: "saved-html",
        snapshotSequence: 1,
      },
    });
    expect(
      isChatGPTShareSnapshotMetadata(sources[0].shareSnapshot)
        ? sources[0].shareSnapshot.previousSnapshotSourceId
        : "invalid-metadata",
    ).toBeUndefined();
    expect(sources[0].shareSnapshot).not.toHaveProperty("shareId");
    expect(sources[0].shareSnapshot).not.toHaveProperty("normalizedShareUrl");
    expect(
      isChatGPTShareSnapshotMetadata(sources[0].shareSnapshot)
        ? sources[0].shareSnapshot.resourceHash
        : "",
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(sources[0].content).not.toMatch(
      /<article|navigation|accountState|ChatGPT can make mistakes/i,
    );

    expect(
      messages.map(
        ({ role, content, order, sourceId: owner, sourceOrdinal }) => ({
          role,
          content,
          order,
          sourceId: owner,
          sourceOrdinal,
        }),
      ),
    ).toEqual([
      {
        role: "user",
        content: "How should I freeze an architecture decision?",
        order: 0,
        sourceId: "phase-2f-source-1",
        sourceOrdinal: 0,
      },
      {
        role: "assistant",
        content:
          "Record the decision, alternatives, and consequences before implementation.",
        order: 1,
        sourceId: "phase-2f-source-1",
        sourceOrdinal: 1,
      },
      {
        role: "user",
        content: "What should happen to an assistant-only update?",
        order: 2,
        sourceId: "phase-2f-source-1",
        sourceOrdinal: 2,
      },
    ]);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toMatchObject({
      order: 1,
      question: "How should I freeze an architecture decision?",
      answer:
        "Record the decision, alternatives, and consequences before implementation.",
      messageIds: ["phase-2f-message-1", "phase-2f-message-2"],
    });
    expect(rounds[1]).toMatchObject({
      order: 2,
      question: "What should happen to an assistant-only update?",
      answer: "",
      messageIds: ["phase-2f-message-3"],
    });
  });

  it("appends a later saved page and extends the enriched unanswered tail Round", async () => {
    const workflow = createPhase2FIndexedDBWorkflow();
    const initialPreview = await workflow.preview({
      shareUrl: PHASE_2F_SHARE_URL,
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-initial.html",
      ),
      newConversation: phase2FConversation(),
    });
    const initialResult = await workflow.confirm({
      previewId: initialPreview.previewId,
      baselineFingerprint: initialPreview.baselineFingerprint as string,
    });
    expect(initialResult.status).toBe("success");

    let reloaded = await reloadIndexedDBStorages();
    const initialSource = reloaded.sources.getAll()[0];
    const initialMessages = reloaded.messages.getByConversationId(
      PHASE_2F_CONVERSATION_ID,
    );
    const initialRounds = reloaded.rounds.getByConversationId(
      PHASE_2F_CONVERSATION_ID,
    );
    const tailRound = initialRounds.find(({ order }) => order === 2);
    expect(tailRound).toBeDefined();
    const enrichedTail: Round = {
      ...(tailRound as Round),
      note: "preserved Phase 2F note",
      summary: "preserved Phase 2F summary",
      context: {
        inheritanceMode: "inherit",
        snapshot: { currentState: "preserved Phase 2F context" },
        confirmedAt: "2026-07-27T02:01:30.000Z",
      },
    };
    await putStores({ rounds: [enrichedTail] });
    reloaded = await reloadIndexedDBStorages();

    const appendPreview = await workflow.preview({
      shareUrl: PHASE_2F_SHARE_URL,
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-assistant-append.html",
      ),
      newConversation: phase2FConversation({
        id: "phase-2f-unused-new-conversation",
      }),
    });

    expect(appendPreview).toMatchObject({
      status: "append",
      target: {
        kind: "existing",
        conversationId: PHASE_2F_CONVERSATION_ID,
        sourceId: "phase-2f-source-1",
      },
      summary: {
        existingMessageCount: 3,
        snapshotMessageCount: 4,
        newMessageCount: 1,
        existingRoundCount: 2,
        newRoundCount: 0,
      },
      confirmable: true,
    });

    const appendResult = await workflow.confirm({
      previewId: appendPreview.previewId,
      baselineFingerprint: appendPreview.baselineFingerprint as string,
    });
    expect(appendResult).toMatchObject({
      status: "success",
      mode: "append",
      receipt: {
        writtenMessageCount: 1,
        writtenRoundCount: 1,
        verifiedMessageCount: 4,
        verifiedRoundCount: 2,
        pendingWriteCount: 0,
      },
    });

    reloaded = await reloadIndexedDBStorages();
    const sources = reloaded.sources.getAll();
    const messages = reloaded.messages.getByConversationId(
      PHASE_2F_CONVERSATION_ID,
    );
    const rounds = reloaded.rounds.getByConversationId(
      PHASE_2F_CONVERSATION_ID,
    );
    const persistedTail = rounds.find(({ order }) => order === 2);

    expect(sources).toHaveLength(2);
    expect(sources.find(({ id }) => id === initialSource.id)).toEqual(
      initialSource,
    );
    expect(
      sources.find(({ id }) => id === "phase-2f-source-2")?.shareSnapshot,
    ).toMatchObject({
      schemaVersion: 2,
      inputKind: "saved-html",
      snapshotMessageCount: 4,
      previousSnapshotSourceId: initialSource.id,
      snapshotSequence: 2,
    });
    expect(messages.slice(0, 3)).toEqual(initialMessages);
    expect(messages[3]).toMatchObject({
      id: "phase-2f-message-4",
      role: "assistant",
      content:
        "Extend the unanswered tail Round without replacing its local enrichment.",
      order: 3,
      sourceId: "phase-2f-source-2",
      sourceOrdinal: 3,
    });
    expect(rounds).toHaveLength(2);
    expect(persistedTail).toMatchObject({
      id: enrichedTail.id,
      note: enrichedTail.note,
      summary: enrichedTail.summary,
      context: enrichedTail.context,
      question: enrichedTail.question,
      title: enrichedTail.title,
      answer:
        "Extend the unanswered tail Round without replacing its local enrichment.",
      messageIds: [
        "phase-2f-message-3",
        "phase-2f-message-4",
      ],
    });
  });

  it("updates an Existing local Snapshot history without a URL and preserves notes, context, and Knowledge", async () => {
    const workflow = createPhase2FIndexedDBWorkflow();
    const initialConversation = phase2FConversation({
      note: "preserved conversation note",
      summary: "preserved conversation summary",
      context: {
        longTermBackground: "preserved background",
        currentState: "preserved current state",
      },
    });
    const initialPreview = await workflow.preview({
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-initial.html",
      ),
      newConversation: initialConversation,
      target: { kind: "new" },
    });
    const initialResult = await workflow.confirm({
      previewId: initialPreview.previewId,
      baselineFingerprint: initialPreview.baselineFingerprint as string,
    });
    expect(initialResult.status).toBe("success");

    let reloaded = await reloadIndexedDBStorages();
    const initialTail = reloaded.rounds
      .getByConversationId(PHASE_2F_CONVERSATION_ID)
      .find(({ order }) => order === 2) as Round;
    const enrichedTail: Round = {
      ...initialTail,
      note: "preserved tail note",
      summary: "preserved tail summary",
      context: {
        inheritanceMode: "inherit",
        snapshot: { currentState: "preserved tail context" },
        confirmedAt: "2026-07-27T02:01:30.000Z",
      },
    };
    const knowledge = {
      id: "phase-2f-preserved-knowledge",
      proposalId: "phase-2f-existing-proposal",
      title: "Preserved knowledge",
      content: "Knowledge must not change during Snapshot append.",
      summary: "Preserved",
      sourceFile: "manual",
      sourceConversationId: PHASE_2F_CONVERSATION_ID,
      tagIds: [],
      createdAt: "2026-07-27T02:01:20.000Z",
      updatedAt: "2026-07-27T02:01:20.000Z",
      status: "Active",
    };
    await putStores({
      rounds: [enrichedTail],
      "knowledge-cards": [knowledge],
    });
    reloaded = await reloadIndexedDBStorages();

    const appendPreview = await workflow.preview({
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-assistant-append.html",
      ),
      newConversation: phase2FConversation({
        id: "phase-2f-unused-no-url-conversation",
      }),
      target: {
        kind: "existing",
        conversationId: PHASE_2F_CONVERSATION_ID,
      },
    });

    expect(appendPreview).toMatchObject({
      status: "append",
      confirmable: true,
      target: {
        kind: "existing",
        conversationId: PHASE_2F_CONVERSATION_ID,
      },
    });
    const appendResult = await workflow.confirm({
      previewId: appendPreview.previewId,
      baselineFingerprint: appendPreview.baselineFingerprint as string,
    });
    expect(appendResult.status).toBe("success");

    reloaded = await reloadIndexedDBStorages();
    expect(
      reloaded.conversations.getById(PHASE_2F_CONVERSATION_ID),
    ).toMatchObject({
      note: initialConversation.note,
      summary: initialConversation.summary,
      context: initialConversation.context,
    });
    expect(
      reloaded.rounds
        .getByConversationId(PHASE_2F_CONVERSATION_ID)
        .find(({ id }) => id === enrichedTail.id),
    ).toMatchObject({
      id: enrichedTail.id,
      note: enrichedTail.note,
      summary: enrichedTail.summary,
      context: enrichedTail.context,
      answer:
        "Extend the unanswered tail Round without replacing its local enrichment.",
    });
    expect(await readAll("knowledge-cards")).toEqual([knowledge]);
  });

  it("blocks a different resourceHash from the selected Existing target without writing", async () => {
    const workflow = createPhase2FIndexedDBWorkflow();
    const initialPreview = await workflow.preview({
      shareUrl: PHASE_2F_SHARE_URL,
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-initial.html",
      ),
      newConversation: phase2FConversation(),
    });
    await workflow.confirm({
      previewId: initialPreview.previewId,
      baselineFingerprint: initialPreview.baselineFingerprint as string,
    });
    const before = JSON.stringify({
      conversations: await readAll("conversations"),
      sources: await readAll("sources"),
      messages: await readAll("messages"),
      rounds: await readAll("rounds"),
    });

    const differentResourcePreview = await workflow.preview({
      shareUrl: PHASE_2F_DIFFERENT_SHARE_URL,
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-assistant-append.html",
      ),
      newConversation: phase2FConversation({
        id: "phase-2f-different-resource-conversation",
      }),
    });
    const targetError = shareSnapshotTargetSelectionError(
      differentResourcePreview,
      "existing",
      PHASE_2F_CONVERSATION_ID,
    );

    expect(differentResourcePreview).toMatchObject({
      status: "new",
      target: {
        kind: "new",
        conversationId: "phase-2f-different-resource-conversation",
      },
    });
    expect(targetError).toContain("首次确认必须使用 New");
    expect(
      JSON.stringify({
        conversations: await readAll("conversations"),
        sources: await readAll("sources"),
        messages: await readAll("messages"),
        rounds: await readAll("rounds"),
      }),
    ).toBe(before);
  });

  it("blocks duplicate heads discovered from canonical saved-page history", async () => {
    const workflow = createPhase2FIndexedDBWorkflow();
    const initialPreview = await workflow.preview({
      shareUrl: PHASE_2F_SHARE_URL,
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-initial.html",
      ),
      newConversation: phase2FConversation(),
    });
    await workflow.confirm({
      previewId: initialPreview.previewId,
      baselineFingerprint: initialPreview.baselineFingerprint as string,
    });
    let reloaded = await reloadIndexedDBStorages();
    const initialSource = reloaded.sources.getAll()[0];
    await putStores({
      sources: [
        {
          ...initialSource,
          id: "phase-2f-duplicate-head",
          name: "Duplicate Phase 2F head",
        },
      ],
    });
    reloaded = await reloadIndexedDBStorages();
    const before = JSON.stringify({
      sources: reloaded.sources.getAll(),
      messages: reloaded.messages.getAll(),
      rounds: reloaded.rounds.getAll(),
    });

    const blocked = await workflow.preview({
      shareUrl: PHASE_2F_SHARE_URL,
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-assistant-append.html",
      ),
      newConversation: phase2FConversation({
        id: "phase-2f-unused-duplicate-head",
      }),
    });

    expect(blocked).toMatchObject({
      status: "blocked",
      confirmable: false,
    });
    expect(blocked.errors.join(" ")).toContain("multiple-heads");
    expect(
      JSON.stringify({
        sources: await readAll("sources"),
        messages: await readAll("messages"),
        rounds: await readAll("rounds"),
      }),
    ).toBe(before);
  });

  it("rejects a saved-page append plan with a sequence mismatch before writing", async () => {
    const workflow = createPhase2FIndexedDBWorkflow();
    const initialPreview = await workflow.preview({
      shareUrl: PHASE_2F_SHARE_URL,
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-initial.html",
      ),
      newConversation: phase2FConversation(),
    });
    await workflow.confirm({
      previewId: initialPreview.previewId,
      baselineFingerprint: initialPreview.baselineFingerprint as string,
    });
    const reloaded = await reloadIndexedDBStorages();
    const currentConversation = reloaded.conversations.getById(
      PHASE_2F_CONVERSATION_ID,
    );
    const currentSource = reloaded.sources.getAll()[0];
    expect(currentConversation).not.toBeNull();

    let nextId = 0;
    const preparation = await prepareChatGPTShareSnapshot({
      shareUrl: PHASE_2F_SHARE_URL,
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-assistant-append.html",
      ),
      capturedAt: "2026-07-27T02:02:00.000Z",
      target: {
        kind: "existing",
        conversation: currentConversation as Conversation,
        source: currentSource,
        messages: reloaded.messages.getByConversationId(
          PHASE_2F_CONVERSATION_ID,
        ),
        rounds: reloaded.rounds.getByConversationId(
          PHASE_2F_CONVERSATION_ID,
        ),
      },
      createId: (kind) => `phase-2f-invalid-${kind}-${++nextId}`,
    });
    expect(preparation.status).toBe("append");
    expect(preparation.canonicalPlan).toBeDefined();
    const plan = preparation.canonicalPlan as ShareSnapshotCanonicalPlan;
    expect(isChatGPTShareSnapshotMetadata(plan.source.shareSnapshot)).toBe(
      true,
    );
    const planMetadata = plan.source
      .shareSnapshot as ChatGPTShareSnapshotMetadata;
    const invalidPlan: ShareSnapshotCanonicalPlan = {
      ...plan,
      source: {
        ...plan.source,
        shareSnapshot: {
          ...planMetadata,
          snapshotSequence: 7,
        },
      },
    };
    const before = JSON.stringify({
      conversations: await readAll("conversations"),
      sources: await readAll("sources"),
      messages: await readAll("messages"),
      rounds: await readAll("rounds"),
    });

    await expect(
      executeShareSnapshotCanonicalOperation(invalidPlan),
    ).rejects.toThrow("expected 2");

    expect(
      JSON.stringify({
        conversations: await readAll("conversations"),
        sources: await readAll("sources"),
        messages: await readAll("messages"),
        rounds: await readAll("rounds"),
      }),
    ).toBe(before);
  });

  it("rejects a stale saved-page baseline and leaves the Snapshot chain unchanged", async () => {
    const workflow = createPhase2FIndexedDBWorkflow();
    const initialPreview = await workflow.preview({
      shareUrl: PHASE_2F_SHARE_URL,
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-initial.html",
      ),
      newConversation: phase2FConversation(),
    });
    await workflow.confirm({
      previewId: initialPreview.previewId,
      baselineFingerprint: initialPreview.baselineFingerprint as string,
    });
    const appendPreview = await workflow.preview({
      shareUrl: PHASE_2F_SHARE_URL,
      snapshot: loadPhase2FSavedHtml(
        "chatgpt-share-snapshot-assistant-append.html",
      ),
      newConversation: phase2FConversation({
        id: "phase-2f-unused-stale",
      }),
    });
    await putStores({
      conversations: [
        phase2FConversation({
          note: "durably changed after Phase 2F preview",
          updatedAt: "2026-07-27T02:02:30.000Z",
        }),
      ],
    });

    const stale = await workflow.confirm({
      previewId: appendPreview.previewId,
      baselineFingerprint: appendPreview.baselineFingerprint as string,
    });

    expect(stale.status).toBe("stale");
    expect(await readAll<ImportedSource>("sources")).toHaveLength(1);
    expect(await readAll<Message>("messages")).toHaveLength(3);
    expect(await readAll<Round>("rounds")).toHaveLength(2);
    expect((await readAll<Conversation>("conversations"))[0].note).toBe(
      "durably changed after Phase 2F preview",
    );
    expect(getPendingWriteCount()).toBe(0);
  });
});
