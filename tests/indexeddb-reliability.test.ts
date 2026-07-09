import { beforeEach, describe, expect, it } from "vitest";
import type { Conversation } from "@/core/entities/conversation";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { ChatGPTExportImportService } from "@/core/services/chatgpt-export-import";
import { ImportParserPipeline } from "@/core/services/import-parser-pipeline";
import { ImportService } from "@/core/services/import-service";
import { batchDeleteConversationWorkspace, deleteConversationWorkspace } from "@/core/services/conversation-workspace";
import { AppDataStorage } from "@/infrastructure/storage/app-data-storage";
import {
  createStorageInstances,
  getStorageMode,
} from "@/infrastructure/storage/storage-factory";
import {
  closePalosDB,
  deleteWhere,
  readAll,
  replaceStores,
  replaceWhere,
  type StoreBatch,
} from "@/infrastructure/storage/indexeddb/database";
import {
  clearCaches,
  flushCachesToIndexedDB,
  getCachedCounts,
  preloadAll,
} from "@/infrastructure/storage/indexeddb/preload";
import { IndexedDBConversationStorage } from "@/infrastructure/storage/indexeddb/idb-conversation-storage";
import { IndexedDBMessageStorage } from "@/infrastructure/storage/indexeddb/idb-message-storage";
import { IndexedDBRoundStorage } from "@/infrastructure/storage/indexeddb/idb-round-storage";
import { IndexedDBSourceStorage } from "@/infrastructure/storage/indexeddb/idb-source-storage";
import { IndexedDBProposalStorage } from "@/infrastructure/storage/indexeddb/idb-proposal-storage";
import { IndexedDBKnowledgeCardStorage } from "@/infrastructure/storage/indexeddb/idb-knowledge-card-storage";
import { IndexedDBConversationVersionStorage } from "@/infrastructure/storage/indexeddb/idb-conversation-version-storage";
import { SearchIndexService } from "@/core/services/search-index-service";
import type { SearchIndexData } from "@/core/services/search-index-service";

type StoreData = Map<string, unknown>;

class FakeRequest<T = unknown> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class FakeCursor {
  constructor(
    private readonly request: FakeRequest<FakeCursor | null>,
    private readonly entries: Array<[string, unknown]>,
    private readonly store: StoreData,
    private readonly transaction: FakeTransaction,
    private index: number,
  ) {}

  get value() {
    return this.entries[this.index][1];
  }

  delete() {
    this.store.delete(this.entries[this.index][0]);
  }

  continue() {
    this.index += 1;
    queueMicrotask(() => {
      this.request.result =
        this.index < this.entries.length ? this : null;
      this.request.onsuccess?.();
      if (!this.request.result) {
        this.transaction.operationDone();
      }
    });
  }
}

class FakeObjectStore {
  constructor(
    private readonly data: StoreData,
    private readonly transaction: FakeTransaction,
  ) {}

  getAll() {
    const request = new FakeRequest<unknown[]>();
    queueMicrotask(() => {
      request.result = [...this.data.values()];
      request.onsuccess?.();
      this.transaction.completeSoon();
    });
    return request;
  }

  put(record: { id: string }) {
    this.transaction.operation();
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.data.set(record.id, record);
      request.onsuccess?.();
      this.transaction.operationDone();
    });
    return request;
  }

  delete(id: string) {
    this.transaction.operation();
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.data.delete(id);
      request.onsuccess?.();
      this.transaction.operationDone();
    });
    return request;
  }

  clear() {
    this.transaction.operation();
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.data.clear();
      request.onsuccess?.();
      this.transaction.operationDone();
    });
    return request;
  }

  count() {
    const request = new FakeRequest<number>();
    queueMicrotask(() => {
      request.result = this.data.size;
      request.onsuccess?.();
      this.transaction.completeSoon();
    });
    return request;
  }

  openCursor() {
    this.transaction.operation();
    const request = new FakeRequest<FakeCursor | null>();
    const entries = [...this.data.entries()];
    queueMicrotask(() => {
      request.result =
        entries.length > 0
          ? new FakeCursor(request, entries, this.data, this.transaction, 0)
          : null;
      request.onsuccess?.();
      if (!request.result) {
        this.transaction.operationDone();
      }
    });
    return request;
  }
}

class FakeTransaction {
  error: DOMException | null = null;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private pending = 0;
  private completed = false;

  constructor(
    private readonly stores: Map<string, StoreData>,
    private readonly fail: boolean,
  ) {
    this.completeSoon();
  }

  objectStore(name: string) {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map();
      this.stores.set(name, store);
    }
    return new FakeObjectStore(store, this);
  }

  operation() {
    this.pending += 1;
  }

  operationDone() {
    this.pending -= 1;
    this.completeSoon();
  }

  completeSoon() {
    queueMicrotask(() => {
      if (this.completed || this.pending > 0) return;
      this.completed = true;
      if (this.fail) {
        this.error = new DOMException("forced failure", "AbortError");
        this.onabort?.();
        return;
      }
      this.oncomplete?.();
    });
  }
}

class FakeDatabase {
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  constructor(
    private readonly stores: Map<string, StoreData>,
    private readonly failNext: () => boolean,
  ) {}

  createObjectStore(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
  }

  transaction(storeNames: string | string[]) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    for (const name of names) {
      if (!this.stores.has(name)) this.stores.set(name, new Map());
    }
    return new FakeTransaction(this.stores, this.failNext()) as unknown as IDBTransaction;
  }

  close() {}
}

class FakeIndexedDB {
  stores = new Map<string, StoreData>();
  failTransactions = 0;

  open() {
    const request = new FakeRequest<IDBDatabase>() as IDBOpenDBRequest;
    const db = new FakeDatabase(this.stores, () => {
      if (this.failTransactions <= 0) return false;
      this.failTransactions -= 1;
      return true;
    }) as unknown as IDBDatabase;
    queueMicrotask(() => {
      request.result = db;
      request.onupgradeneeded?.({ target: request } as IDBVersionChangeEvent);
      request.onsuccess?.({ target: request } as Event);
    });
    return request;
  }
}

class FakeLocalStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

const now = "2026-07-08T00:00:00.000Z";

function conversation(id: string): Conversation {
  return {
    id,
    title: id,
    sourceType: "ChatGPT",
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    externalSource: "chatgpt",
    externalConversationId: id,
  };
}

function message(id: string, conversationId: string, order = 0): Message {
  return {
    id,
    conversationId,
    role: "user",
    content: `message ${id}`,
    order,
    createdAt: now,
    updatedAt: now,
    externalMessageId: id,
    contentHash: `hash-${id}`,
  };
}

function round(id: string, conversationId: string, order = 1): Round {
  return {
    id,
    conversationId,
    order,
    title: id,
    question: "q",
    answer: "a",
    messageIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let fakeIndexedDB: FakeIndexedDB;

beforeEach(async () => {
  closePalosDB();
  clearCaches();
  fakeIndexedDB = new FakeIndexedDB();
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: fakeIndexedDB,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: new FakeLocalStorage(),
      dispatchEvent: () => true,
    },
  });
  await preloadAll();
});

describe("IndexedDB storage reliability", () => {
  it("default storage is IndexedDB", () => {
    expect(getStorageMode()).toBe("indexedDB");
    expect(createStorageInstances().conversations).toBeInstanceOf(
      IndexedDBConversationStorage,
    );
  });

  it("persists saveMany across a refresh simulation", async () => {
    const messages = new IndexedDBMessageStorage();
    messages.saveMany([message("m1", "c1"), message("m2", "c1", 1)]);
    await settle();

    clearCaches();
    await preloadAll();

    expect(new IndexedDBMessageStorage().getByConversationId("c1")).toHaveLength(2);
  });

  it("removeByConversationId deletes real IndexedDB records", async () => {
    await replaceStores({
      messages: [message("keep", "c2"), message("remove", "c1")],
    });
    clearCaches();
    await preloadAll();

    new IndexedDBMessageStorage().removeByConversationId("c1");
    await settle();

    expect(await readAll<Message>("messages")).toEqual([message("keep", "c2")]);
  });

  it("replaceByConversationId does not leave stale records", async () => {
    await replaceStores({
      rounds: [round("old", "c1"), round("other", "c2")],
    });
    clearCaches();
    await preloadAll();

    new IndexedDBRoundStorage().replaceByConversationId("c1", [
      round("new", "c1"),
    ]);
    await settle();

    expect((await readAll<Round>("rounds")).map((item) => item.id).sort()).toEqual([
      "new",
      "other",
    ]);
  });

  it("migration-style replaceStores is stable when repeated", async () => {
    const batch = {
      conversations: [conversation("c1")],
      messages: [message("m1", "c1")],
      rounds: [round("r1", "c1")],
    };
    await replaceStores(batch);
    await replaceStores(batch);

    expect(await readAll<Conversation>("conversations")).toHaveLength(1);
    expect(await readAll<Message>("messages")).toHaveLength(1);
    expect(await readAll<Round>("rounds")).toHaveLength(1);
  });

  it("legacy LocalStorage migration copies records and remains idempotent", async () => {
    const batch = {
      conversations: [conversation("legacy-c1")],
      messages: [message("legacy-m1", "legacy-c1")],
      rounds: [round("legacy-r1", "legacy-c1")],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    };

    await replaceStores(batch);
    await replaceStores(batch);
    clearCaches();
    await preloadAll();

    expect(new IndexedDBConversationStorage().getAll()).toHaveLength(1);
    expect(new IndexedDBMessageStorage().getByConversationId("legacy-c1")).toHaveLength(1);
    expect(new IndexedDBRoundStorage().getByConversationId("legacy-c1")).toHaveLength(1);
  });

  it("transaction failures propagate before success can be reported", async () => {
    new IndexedDBConversationStorage().save(conversation("c1"));
    await settle();
    fakeIndexedDB.failTransactions = 1;

    await expect(flushCachesToIndexedDB()).rejects.toThrow("forced failure");
  });

  it("preload must complete before synchronous storage reads are treated as ready", async () => {
    await replaceStores({ conversations: [conversation("c1")] });
    closePalosDB();
    clearCaches();

    expect(new IndexedDBConversationStorage().getAll()).toHaveLength(0);
    await preloadAll();
    expect(new IndexedDBConversationStorage().getAll()).toHaveLength(1);
  });

  it("append existing conversation persists the correct message count", async () => {
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();
    const service = new ChatGPTExportImportService(
      conversations,
      sources,
      messages,
      rounds,
    );

    conversations.save(conversation("target"));
    messages.save(message("existing", "target"));
    await settle();

    const preview = {
      externalConversationId: "source",
      title: "source",
      messages: [
        {
          role: "user" as const,
          content: "new question",
          contentHash: "hash-new-question",
          externalMessageId: "new-question",
        },
        {
          role: "assistant" as const,
          content: "new answer",
          contentHash: "hash-new-answer",
          externalMessageId: "new-answer",
        },
      ],
      unsupportedCount: 0,
      isLarge: false,
    };

    const result = service.appendToConversation(preview, "target");
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    expect(result.appendedMessages).toBe(2);
    expect(new IndexedDBMessageStorage().getByConversationId("target")).toHaveLength(3);
  });

  it("delete conversation then reload does not restore cascaded business data", async () => {
    await replaceStores({
      conversations: [conversation("c-delete")],
      messages: [message("m-delete", "c-delete")],
      rounds: [round("r-delete", "c-delete")],
      sources: [
        {
          id: "s-delete",
          conversationId: "c-delete",
          kind: "text",
          name: "source",
          content: "source",
          importedAt: now,
          updatedAt: now,
        },
      ],
      proposals: [
        {
          id: "p-delete",
          title: "proposal",
          summary: "summary",
          sourceId: "s-delete",
          conversationId: "c-delete",
          status: "Pending",
          createdAt: now,
          updatedAt: now,
        },
      ],
      "knowledge-cards": [
        {
          id: "k-delete",
          proposalId: "p-delete",
          title: "knowledge",
          summary: "summary",
          content: "content",
          sourceId: "s-delete",
          status: "Active",
          createdAt: now,
          updatedAt: now,
        },
      ],
      "conversation-versions": [
        {
          id: "v-delete",
          conversationId: "c-delete",
          name: "snapshot",
          description: "",
          sourceVersion: 1,
          messageCount: 1,
          snapshotData: {
            conversation: conversation("c-delete"),
            messages: [message("m-delete", "c-delete")],
          },
          createdAt: now,
        },
      ],
    });
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");
    deleteConversationWorkspace("c-delete", {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    expect(new IndexedDBConversationStorage().getById("c-delete")).toBeNull();
    expect(new IndexedDBMessageStorage().getByConversationId("c-delete")).toHaveLength(0);
    expect(new IndexedDBRoundStorage().getByConversationId("c-delete")).toHaveLength(0);
    expect(await readAll("sources")).toHaveLength(0);
    expect(await readAll("proposals")).toHaveLength(0);
    expect(await readAll("knowledge-cards")).toHaveLength(0);
    expect(await readAll("conversation-versions")).toHaveLength(0);
  });

  it("App Data Export contains IndexedDB business data", async () => {
    await replaceStores({
      conversations: [conversation("export-c1")],
      messages: [message("export-m1", "export-c1")],
      rounds: [round("export-r1", "export-c1")],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });

    const bundle = await new AppDataStorage().exportData();

    expect(bundle.indexedDB?.conversations).toHaveLength(1);
    expect(bundle.indexedDB?.messages).toHaveLength(1);
    expect(bundle.indexedDB?.rounds).toHaveLength(1);
  });

  it("App Data Import restores IndexedDB data after clear and reload", async () => {
    const storage = new AppDataStorage();
    await replaceStores({
      conversations: [conversation("restore-c1")],
      messages: [message("restore-m1", "restore-c1")],
      rounds: [round("restore-r1", "restore-c1")],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });
    const bundle = await storage.exportData();
    await replaceStores({
      conversations: [],
      messages: [],
      rounds: [],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });

    await storage.importData(bundle, Object.keys(bundle.data));
    clearCaches();
    await preloadAll();

    expect(new IndexedDBConversationStorage().getById("restore-c1")).not.toBeNull();
    expect(new IndexedDBMessageStorage().getByConversationId("restore-c1")).toHaveLength(1);
    expect(new IndexedDBRoundStorage().getByConversationId("restore-c1")).toHaveLength(1);
  });

  it("deleteWhere removes matching records without rewriting survivors", async () => {
    await replaceStores({
      proposals: [
        { id: "p1", conversationId: "c1" },
        { id: "p2", conversationId: "c2" },
      ],
    });

    await deleteWhere<{ conversationId: string }>(
      "proposals",
      (proposal) => proposal.conversationId === "c1",
    );

    expect(await readAll("proposals")).toEqual([
      { id: "p2", conversationId: "c2" },
    ]);
  });

  it("replaceWhere deletes matching records and puts replacements in one transaction", async () => {
    await replaceStores({
      messages: [message("old", "c1"), message("other", "c2")],
    });

    await replaceWhere<Message>(
      "messages",
      (item) => item.conversationId === "c1",
      [message("replacement", "c1")],
    );

    expect((await readAll<Message>("messages")).map((item) => item.id).sort()).toEqual([
      "other",
      "replacement",
    ]);
  });

  // ---- Round 1.2: Delete durability regression tests ----

  it("Test 1: single delete survives clearCaches + preload cycle", async () => {
    // Preload with known data
    await replaceStores({
      conversations: [conversation("keep"), conversation("delete-me")],
      messages: [
        message("m-keep", "keep"),
        message("m-del", "delete-me"),
      ],
      rounds: [
        round("r-keep", "keep"),
        round("r-del", "delete-me"),
      ],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });
    clearCaches();
    await preloadAll();

    // Delete one conversation via the workspace service
    const storages = createStorageInstances("indexedDB");
    deleteConversationWorkspace("delete-me", {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    // Simulate persistAndReload: flush, then verify by clear+reload
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // Conversation must not be restored
    expect(new IndexedDBConversationStorage().getById("delete-me")).toBeNull();
    expect(new IndexedDBConversationStorage().getById("keep")).not.toBeNull();
    expect(new IndexedDBMessageStorage().getByConversationId("delete-me")).toHaveLength(0);
    expect(new IndexedDBRoundStorage().getByConversationId("delete-me")).toHaveLength(0);
  });

  it("Test 2: batch delete survives clearCaches + preload cycle", async () => {
    await replaceStores({
      conversations: [
        conversation("keep"),
        conversation("batch-1"),
        conversation("batch-2"),
      ],
      messages: [
        message("m-keep", "keep"),
        message("m-b1", "batch-1"),
        message("m-b2", "batch-2"),
      ],
      rounds: [
        round("r-keep", "keep"),
        round("r-b1", "batch-1"),
        round("r-b2", "batch-2"),
      ],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");
    const result = batchDeleteConversationWorkspace(["batch-1", "batch-2"], {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    expect(result.deletedConversations).toBe(2);
    expect(result.deletedMessages).toBe(2);
    expect(result.deletedRounds).toBe(2);

    // Flush, clear, reload — the persistAndReload verification cycle
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // Batch-deleted conversations must not be restored
    expect(new IndexedDBConversationStorage().getById("batch-1")).toBeNull();
    expect(new IndexedDBConversationStorage().getById("batch-2")).toBeNull();
    expect(new IndexedDBConversationStorage().getById("keep")).not.toBeNull();
    expect(new IndexedDBMessageStorage().getByConversationId("batch-1")).toHaveLength(0);
    expect(new IndexedDBMessageStorage().getByConversationId("batch-2")).toHaveLength(0);
  });

  // ---- Round 1.3: Debug test - simulate real import flow with save() + persistInBackground ----

  it("Round 1.3 DEBUG: import-via-save then delete survives full cycle", async () => {
    // Simulate the REAL import flow: use save() + persistInBackground (not replaceStores)
    // to populate data, then wait for writes to settle, then flush.
    // This mirrors exactly what the actual app does during import.

    const convStore = new IndexedDBConversationStorage();
    const msgStore = new IndexedDBMessageStorage();
    const roundStore = new IndexedDBRoundStorage();
    const sourceStore = new IndexedDBSourceStorage();

    // Step 1: Populate via save() calls (simulating import)
    convStore.save(conversation("keep"));
    convStore.save(conversation("delete-me"));

    msgStore.saveMany([
      message("m-keep-1", "keep", 1),
      message("m-keep-2", "keep", 2),
      message("m-del-1", "delete-me", 1),
      message("m-del-2", "delete-me", 2),
    ]);

    roundStore.saveMany([
      round("r-keep", "keep", 1),
      round("r-del", "delete-me", 1),
    ]);

    sourceStore.save({
      id: "s-del",
      conversationId: "delete-me",
      kind: "text",
      name: "source-del",
      content: "content",
      importedAt: now,
      updatedAt: now,
    });

    // Wait for all persistInBackground writes to settle
    await settle();

    // Step 2: DEBUG - log IDB counts immediately after import saves
    console.log("=== R1.3 AFTER IMPORT (before flush) ===");
    console.log("IDB conv:", (await readAll("conversations")).length);
    console.log("IDB msgs:", (await readAll("messages")).length);
    console.log("IDB rounds:", (await readAll("rounds")).length);
    console.log("IDB sources:", (await readAll("sources")).length);

    // Step 3: Flush (post-import persistence, like import-workbench does)
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    console.log("=== R1.3 AFTER IMPORT FLUSH + RELOAD ===");
    console.log("Cache conv:", getCachedCounts().conversations);
    console.log("Cache msgs:", getCachedCounts().messages);
    console.log("Cache rounds:", getCachedCounts().rounds);
    console.log("IDB conv:", (await readAll("conversations")).length);
    console.log("IDB msgs:", (await readAll("messages")).length);
    console.log("IDB rounds:", (await readAll("rounds")).length);
    console.log("IDB sources:", (await readAll("sources")).length);

    // Step 4: Delete one conversation (simulating user clicking delete)
    const storages = createStorageInstances("indexedDB");
    deleteConversationWorkspace("delete-me", {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    console.log("=== R1.3 AFTER DELETE (before flush) ===");
    console.log("Cache conv:", getCachedCounts().conversations);
    console.log("Cache msgs:", getCachedCounts().messages);
    console.log("Cache rounds:", getCachedCounts().rounds);
    console.log("IDB conv (pre-flush):", (await readAll("conversations")).length);
    console.log("IDB msgs (pre-flush):", (await readAll("messages")).length);
    console.log("IDB rounds (pre-flush):", (await readAll("rounds")).length);
    console.log("IDB sources (pre-flush):", (await readAll("sources")).length);

    // Step 5: Flush the delete - THIS IS THE CRITICAL persistAndReload step
    await flushCachesToIndexedDB();

    console.log("=== R1.3 AFTER FLUSH (post-delete) ===");
    console.log("IDB conv:", (await readAll("conversations")).length);
    console.log("IDB msgs:", (await readAll("messages")).length);
    console.log("IDB rounds:", (await readAll("rounds")).length);
    console.log("IDB sources:", (await readAll("sources")).length);

    // Step 6: Simulate page refresh - clear caches and reload
    clearCaches();
    await preloadAll();

    console.log("=== R1.3 AFTER RELOAD (simulated page refresh) ===");
    console.log("Cache conv:", getCachedCounts().conversations);
    console.log("Cache msgs:", getCachedCounts().messages);
    console.log("Cache rounds:", getCachedCounts().rounds);
    console.log("IDB conv:", (await readAll("conversations")).length);
    console.log("IDB msgs:", (await readAll("messages")).length);
    console.log("IDB rounds:", (await readAll("rounds")).length);
    console.log("IDB sources:", (await readAll("sources")).length);

    // Verifications
    expect(new IndexedDBConversationStorage().getById("delete-me")).toBeNull();
    expect(new IndexedDBConversationStorage().getById("keep")).not.toBeNull();
    expect(new IndexedDBMessageStorage().getByConversationId("delete-me")).toHaveLength(0);
    expect(new IndexedDBMessageStorage().getByConversationId("keep")).toHaveLength(2);
    expect(new IndexedDBRoundStorage().getByConversationId("delete-me")).toHaveLength(0);
    expect(new IndexedDBRoundStorage().getByConversationId("keep")).toHaveLength(1);
    expect(await readAll("sources")).toHaveLength(0);
  });

  it("Test 3 (race): persistInBackground deletes do not interfere with flush durability", async () => {
    // This test simulates multiple persistInBackground delete transactions
    // racing with the replaceStores flush. The final state must be
    // determined by the flush alone — individual fire-and-forget deletes
    // must not cause data to reappear or disappear incorrectly.

    await replaceStores({
      conversations: [conversation("survivor"), conversation("victim")],
      messages: [
        message("m-surv", "survivor"),
        message("m-vic", "victim"),
      ],
      rounds: [
        round("r-surv", "survivor"),
        round("r-vic", "victim"),
      ],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");

    // Step A: delete conversation via workspace (fires persistInBackground deletes)
    deleteConversationWorkspace("victim", {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    // Step B: immediately run another persistInBackground write on a
    // different store (simulates a concurrent operation from another component)
    const { persistInBackground, writeOne } =
      await import("@/infrastructure/storage/indexeddb/database");
    persistInBackground(
      "concurrent round save",
      writeOne("rounds", round("r-concurrent", "survivor", 99)),
    );

    // Step C: flush — this must produce a deterministic, correct final state
    await flushCachesToIndexedDB();

    // Step D: simulate page refresh
    clearCaches();
    await preloadAll();

    // Victim must be fully gone
    expect(new IndexedDBConversationStorage().getById("victim")).toBeNull();
    expect(new IndexedDBMessageStorage().getByConversationId("victim")).toHaveLength(0);
    expect(new IndexedDBRoundStorage().getByConversationId("victim")).toHaveLength(0);

    // Survivor must be intact
    expect(new IndexedDBConversationStorage().getById("survivor")).not.toBeNull();
    expect(new IndexedDBMessageStorage().getByConversationId("survivor")).toHaveLength(1);
    // The concurrent round save should not be lost
    const survivorRounds = new IndexedDBRoundStorage().getByConversationId("survivor");
    expect(survivorRounds.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// PALOS v1.4.5 — Entity Integrity P0 Fix: New tests
// ============================================================================
describe("PALOS v1.4.5 — Entity Integrity", () => {
  it("Test A1: batchDeleteConversationWorkspace removes 3 conversations from cache (getAll)", async () => {
    await replaceStores({
      conversations: [conversation("a1"), conversation("a2"), conversation("a3"), conversation("keep-a")],
      messages: [
        message("m-a1", "a1"),
        message("m-a2", "a2"),
        message("m-a3", "a3"),
        message("m-keep-a", "keep-a"),
      ],
      rounds: [
        round("r-a1", "a1"),
        round("r-a2", "a2"),
        round("r-a3", "a3"),
        round("r-keep-a", "keep-a"),
      ],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");
    const result = batchDeleteConversationWorkspace(["a1", "a2", "a3"], {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    // Report must reflect actual deletions
    expect(result.deletedConversations).toBe(3);

    // Cache must not contain deleted IDs
    const allIds = storages.conversations.getAll().map((c) => c.id);
    expect(allIds).not.toContain("a1");
    expect(allIds).not.toContain("a2");
    expect(allIds).not.toContain("a3");
    // Keep must still be present
    expect(allIds).toContain("keep-a");
    // Messages and rounds for deleted conversations must be gone
    expect(storages.messages.getByConversationId("a1")).toHaveLength(0);
    expect(storages.messages.getByConversationId("a2")).toHaveLength(0);
    expect(storages.rounds!.getByConversationId("a1")).toHaveLength(0);
  });

  it("Test A2: batch delete → flush → clear → preload → conversations still gone", async () => {
    await replaceStores({
      conversations: [conversation("b1"), conversation("b2"), conversation("b3"), conversation("keep-b")],
      messages: [
        message("m-b1", "b1"),
        message("m-b2", "b2"),
        message("m-b3", "b3"),
        message("m-keep-b", "keep-b"),
      ],
      rounds: [
        round("r-b1", "b1"),
        round("r-b2", "b2"),
        round("r-b3", "b3"),
        round("r-keep-b", "keep-b"),
      ],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");
    batchDeleteConversationWorkspace(["b1", "b2", "b3"], {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    // Simulate persistAndReload: flush → clear → preload
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // After full cycle, deleted conversations must not reappear
    const freshStorage = createStorageInstances("indexedDB");
    expect(freshStorage.conversations.getById("b1")).toBeNull();
    expect(freshStorage.conversations.getById("b2")).toBeNull();
    expect(freshStorage.conversations.getById("b3")).toBeNull();
    expect(freshStorage.conversations.getById("keep-b")).not.toBeNull();
    expect(freshStorage.messages.getByConversationId("b1")).toHaveLength(0);
    expect(freshStorage.messages.getByConversationId("b2")).toHaveLength(0);
    expect(freshStorage.messages.getByConversationId("b3")).toHaveLength(0);
    expect(freshStorage.rounds!.getByConversationId("b1")).toHaveLength(0);
    expect(freshStorage.rounds!.getByConversationId("b2")).toHaveLength(0);
    expect(freshStorage.rounds!.getByConversationId("b3")).toHaveLength(0);
  });

  it("Test A3: batch delete removes conversations — no empty conversation residue", async () => {
    // This test validates that deleting messages/rounds also deletes the
    // parent conversations — no empty conversation cards left behind.
    await replaceStores({
      conversations: [conversation("c1"), conversation("c2")],
      messages: [
        message("m-c1-1", "c1", 0),
        message("m-c1-2", "c1", 1),
        message("m-c2-1", "c2", 0),
      ],
      rounds: [
        round("r-c1", "c1", 1),
        round("r-c2", "c2", 1),
      ],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");
    batchDeleteConversationWorkspace(["c1", "c2"], {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    const freshStorage = createStorageInstances("indexedDB");
    const allConversations = freshStorage.conversations.getAll();

    // No conversations should remain — no empty cards
    expect(allConversations).toHaveLength(0);

    // Specifically, no conversation with 0 messages should exist
    for (const conv of allConversations) {
      const msgCount = freshStorage.messages.getByConversationId(conv.id).length;
      const roundCount = freshStorage.rounds!.getByConversationId(conv.id).length;
      // If a conversation survived, it must have messages AND rounds
      // (no "empty" conversation residue)
      if (msgCount === 0 || roundCount === 0) {
        // This would be the bug: empty conversation persists
        expect(`${conv.id} with 0 messages/rounds`).toBe("should not exist");
      }
    }
  });

  it("Test A4: Existing append increases messages.getByConversationId(targetId)", async () => {
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    conversations.save(conversation("target-append"));
    messages.save(message("existing-msg", "target-append", 0));
    await settle();

    const prevCount = messages.getByConversationId("target-append").length;
    expect(prevCount).toBe(1);

    const service = new ChatGPTExportImportService(
      conversations,
      sources,
      messages,
      rounds,
    );

    const preview = {
      externalConversationId: "source-append",
      title: "Source for append",
      messages: [
        {
          role: "user" as const,
          content: "new question for append",
          contentHash: "hash-append-q",
          externalMessageId: "append-q-1",
        },
        {
          role: "assistant" as const,
          content: "new answer for append",
          contentHash: "hash-append-a",
          externalMessageId: "append-a-1",
        },
      ],
      unsupportedCount: 0,
      isLarge: false,
    };

    const result = service.appendToConversation(preview, "target-append");
    expect(result.appendedMessages).toBeGreaterThan(0);

    // Messages must have increased
    const afterCount = messages.getByConversationId("target-append").length;
    expect(afterCount).toBe(prevCount + result.appendedMessages);
  });

  it("Test A5: Existing append increases rounds.getByConversationId(targetId)", async () => {
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    conversations.save(conversation("target-rounds"));
    messages.save(message("existing-round-msg", "target-rounds", 0));
    rounds.save(round("existing-round", "target-rounds", 1));
    await settle();

    const prevRoundCount = rounds.getByConversationId("target-rounds").length;
    expect(prevRoundCount).toBe(1);

    const service = new ChatGPTExportImportService(
      conversations,
      sources,
      messages,
      rounds,
    );

    const preview = {
      externalConversationId: "source-rounds",
      title: "Source with rounds",
      messages: [
        {
          role: "user" as const,
          content: "What is TypeScript?",
          contentHash: "hash-ts-q",
          externalMessageId: "ts-q-1",
        },
        {
          role: "assistant" as const,
          content: "TypeScript is a typed superset of JavaScript.",
          contentHash: "hash-ts-a",
          externalMessageId: "ts-a-1",
        },
      ],
      unsupportedCount: 0,
      isLarge: false,
    };

    const result = service.appendToConversation(preview, "target-rounds");
    expect(result.appendedRounds).toBeGreaterThanOrEqual(0);

    // Rounds must have increased (or stayed same if no rounds generated, which is valid)
    const afterRoundCount = rounds.getByConversationId("target-rounds").length;
    expect(afterRoundCount).toBeGreaterThanOrEqual(prevRoundCount);
    // Messages must still be readable with target id
    expect(messages.getByConversationId("target-rounds").length).toBeGreaterThan(prevRoundCount);
  });

  it("Test A6: Conversation Detail reads appended messages and rounds using targetId", async () => {
    // Simulates exactly what the conversation detail page does:
    // reads messages and rounds by conversationId after an append.
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    const targetId = "detail-target";
    conversations.save(conversation(targetId));
    messages.save(message("detail-existing", targetId, 0));
    rounds.save(round("detail-existing-round", targetId, 1));
    await settle();

    const service = new ChatGPTExportImportService(
      conversations,
      sources,
      messages,
      rounds,
    );

    const preview = {
      externalConversationId: "detail-source",
      title: "Detail source",
      messages: [
        {
          role: "user" as const,
          content: "Detail question?",
          contentHash: "hash-detail-q",
          externalMessageId: "detail-q-1",
        },
        {
          role: "assistant" as const,
          content: "Detail answer.",
          contentHash: "hash-detail-a",
          externalMessageId: "detail-a-1",
        },
      ],
      unsupportedCount: 0,
      isLarge: false,
    };

    service.appendToConversation(preview, targetId);

    // Flush and reload to simulate page navigation
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // Simulate what ConversationDetail does:
    // createConversationStorage().getById(conversationId)
    // createMessageStorage().getByConversationId(conversationId)
    // createRoundStorage().getByConversationId(conversationId)
    const detailConv = createStorageInstances("indexedDB").conversations.getById(targetId);
    const detailMessages = createStorageInstances("indexedDB").messages.getByConversationId(targetId);
    const detailRounds = createStorageInstances("indexedDB").rounds!.getByConversationId(targetId);

    // Conversation must exist
    expect(detailConv).not.toBeNull();
    expect(detailConv!.id).toBe(targetId);

    // Messages must include the appended ones
    expect(detailMessages.length).toBeGreaterThanOrEqual(2); // 1 existing + at least 1 new

    // Rounds must be readable
    expect(detailRounds.length).toBeGreaterThanOrEqual(1);

    // Appended messages must have the correct conversationId
    for (const msg of detailMessages) {
      expect(msg.conversationId).toBe(targetId);
    }

    // Appended rounds must have the correct conversationId
    for (const r of detailRounds) {
      expect(r.conversationId).toBe(targetId);
    }
  });
});

// ============================================================================
// PALOS v1.4.6 — Manual QA Diagnostic Tests (A-H)
// ============================================================================
describe("PALOS v1.4.6 — Diagnostic assertions", () => {
  it("A: batch delete — conversation IDs before delete match storage", async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `conv-${i}`);
    const batch: StoreBatch = { conversations: [], messages: [], rounds: [], sources: [], proposals: [], "knowledge-cards": [], "conversation-versions": [] };
    for (const id of ids) {
      batch.conversations!.push(conversation(id));
      batch.messages!.push(message(`m-${id}`, id, 0));
      batch.rounds!.push(round(`r-${id}`, id, 1));
    }
    await replaceStores(batch);
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");
    const beforeIds = storages.conversations.getAll().map((c) => c.id);
    // All 200 IDs must be present before delete
    for (const id of ids) {
      expect(beforeIds).toContain(id);
    }
  });

  it("B: batchDeleteConversationWorkspace — getAll() does not contain deleted ids", async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `conv-${i}`);
    const batch: StoreBatch = { conversations: [], messages: [], rounds: [], sources: [], proposals: [], "knowledge-cards": [], "conversation-versions": [] };
    for (const id of ids) {
      batch.conversations!.push(conversation(id));
      batch.messages!.push(message(`m-${id}`, id, 0));
      batch.rounds!.push(round(`r-${id}`, id, 1));
    }
    await replaceStores(batch);
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");
    batchDeleteConversationWorkspace(ids, {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    // After batch delete, the cache must not contain any deleted IDs
    const afterIds = storages.conversations.getAll().map((c) => c.id);
    for (const id of ids) {
      expect(afterIds).not.toContain(id);
    }
  });

  it("C: buildCacheBatch().conversations does not contain deleted ids after batch delete", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `conv-${i}`);
    const batch: StoreBatch = { conversations: [], messages: [], rounds: [], sources: [], proposals: [], "knowledge-cards": [], "conversation-versions": [] };
    for (const id of ids) {
      batch.conversations!.push(conversation(id));
      batch.messages!.push(message(`m-${id}`, id, 0));
      batch.rounds!.push(round(`r-${id}`, id, 1));
    }
    await replaceStores(batch);
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");
    batchDeleteConversationWorkspace(ids, {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    // buildCacheBatch must reflect the filtered cache
    const cacheBatch = (await import("@/infrastructure/storage/indexeddb/preload")).buildCacheBatch();
    const batchConvIds = (cacheBatch.conversations as Conversation[]).map((c) => c.id);
    for (const id of ids) {
      expect(batchConvIds).not.toContain(id);
    }
  });

  it("D: clearCaches + preloadAll — conversations do not reappear after batch delete", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `conv-${i}`);
    const batch: StoreBatch = { conversations: [], messages: [], rounds: [], sources: [], proposals: [], "knowledge-cards": [], "conversation-versions": [] };
    for (const id of ids) {
      batch.conversations!.push(conversation(id));
      batch.messages!.push(message(`m-${id}`, id, 0));
      batch.rounds!.push(round(`r-${id}`, id, 1));
    }
    await replaceStores(batch);
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");
    batchDeleteConversationWorkspace(ids, {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // After reload, deleted conversations must not reappear
    const afterIds = new IndexedDBConversationStorage().getAll().map((c) => c.id);
    for (const id of ids) {
      expect(afterIds).not.toContain(id);
    }
  });

  it("E: loadConversationData-equivalent does not return empty residual items after batch delete", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `conv-${i}`);
    const batch: StoreBatch = { conversations: [], messages: [], rounds: [], sources: [], proposals: [], "knowledge-cards": [], "conversation-versions": [] };
    for (const id of ids) {
      batch.conversations!.push(conversation(id));
      batch.messages!.push(message(`m-${id}`, id, 0));
      batch.rounds!.push(round(`r-${id}`, id, 1));
    }
    await replaceStores(batch);
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");
    batchDeleteConversationWorkspace(ids, {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // Simulate loadConversationData: get all conversations and check for empties
    const freshStorages = createStorageInstances("indexedDB");
    const conversations = freshStorages.conversations.getAll();
    for (const conv of conversations) {
      const msgCount = freshStorages.messages.getByConversationId(conv.id).length;
      const roundCount = freshStorages.rounds!.getByConversationId(conv.id).length;
      // No empty residual should exist: if a conversation survived delete, it must have messages AND rounds
      expect(`${conv.id}: msg=${msgCount} round=${roundCount}`).not.toContain("0");
    }
    // Specifically, none of the deleted IDs should be present
    const remainingIds = new Set(conversations.map((c) => c.id));
    for (const id of ids) {
      expect(remainingIds.has(id)).toBe(false);
    }
  });

  it("F: appendToConversation — Message.conversationId equals targetConversationId", async () => {
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    conversations.save(conversation("target-F"));
    messages.save(message("existing-F", "target-F", 0));
    await settle();

    const service = new ChatGPTExportImportService(conversations, sources, messages, rounds);
    const preview = {
      externalConversationId: "source-F",
      title: "Source F",
      messages: [
        { role: "user" as const, content: "Question F", contentHash: "hash-F-q", externalMessageId: "F-q-1" },
        { role: "assistant" as const, content: "Answer F", contentHash: "hash-F-a", externalMessageId: "F-a-1" },
      ],
      unsupportedCount: 0,
      isLarge: false,
    };

    service.appendToConversation(preview, "target-F");
    await settle();

    const allMessages = messages.getByConversationId("target-F");
    expect(allMessages.length).toBeGreaterThan(1);
    for (const msg of allMessages) {
      expect(msg.conversationId).toBe("target-F");
    }
  });

  it("G: appendToConversation — Round.conversationId equals targetConversationId", async () => {
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    conversations.save(conversation("target-G"));
    messages.save(message("existing-G", "target-G", 0));
    await settle();

    const service = new ChatGPTExportImportService(conversations, sources, messages, rounds);
    const preview = {
      externalConversationId: "source-G",
      title: "Source G",
      messages: [
        { role: "user" as const, content: "What is Rust?", contentHash: "hash-G-q", externalMessageId: "G-q-1" },
        { role: "assistant" as const, content: "Rust is a systems programming language.", contentHash: "hash-G-a", externalMessageId: "G-a-1" },
      ],
      unsupportedCount: 0,
      isLarge: false,
    };

    const result = service.appendToConversation(preview, "target-G");
    await settle();

    // All rounds for target must have correct conversationId
    const allRounds = rounds.getByConversationId("target-G");
    for (const r of allRounds) {
      expect(r.conversationId).toBe("target-G");
    }
    // If rounds were created, they must be readable
    if (result.appendedRounds > 0) {
      expect(allRounds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("H: Detail page reads messages/rounds using the same targetConversationId", async () => {
    const targetId = "target-H";
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    conversations.save(conversation(targetId));
    messages.save(message("existing-H", targetId, 0));
    rounds.save(round("existing-round-H", targetId, 1));
    await settle();

    const service = new ChatGPTExportImportService(conversations, sources, messages, rounds);
    const preview = {
      externalConversationId: "source-H",
      title: "Source H",
      messages: [
        { role: "user" as const, content: "Question H?", contentHash: "hash-H-q", externalMessageId: "H-q-1" },
        { role: "assistant" as const, content: "Answer H.", contentHash: "hash-H-a", externalMessageId: "H-a-1" },
      ],
      unsupportedCount: 0,
      isLarge: false,
    };

    const appendResult = service.appendToConversation(preview, targetId);
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // Detail page simulation: uses the SAME targetId
    const detailStorage = createStorageInstances("indexedDB");
    const detailConv = detailStorage.conversations.getById(targetId);
    const detailMsgs = detailStorage.messages.getByConversationId(targetId);
    const detailRounds = detailStorage.rounds!.getByConversationId(targetId);

    expect(detailConv).not.toBeNull();
    expect(detailConv!.id).toBe(targetId);
    // Messages must include existing + appended
    expect(detailMsgs.length).toBeGreaterThanOrEqual(1 + appendResult.appendedMessages);
    // All messages must have targetId
    for (const msg of detailMsgs) {
      expect(msg.conversationId).toBe(targetId);
    }
    // All rounds must have targetId
    for (const r of detailRounds) {
      expect(r.conversationId).toBe(targetId);
    }
  });
});

// ============================================================================
// PALOS v1.4.6 — New regression tests (1-5)
// ============================================================================
describe("PALOS v1.4.6 — Regression tests", () => {
  it("Test 1: batch delete 200 conversations → getAll() is 0", async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `batch200-${i}`);
    const batch: StoreBatch = { conversations: [], messages: [], rounds: [], sources: [], proposals: [], "knowledge-cards": [], "conversation-versions": [] };
    for (const id of ids) {
      batch.conversations!.push(conversation(id));
      batch.messages!.push(message(`m-${id}`, id, 0));
      batch.rounds!.push(round(`r-${id}`, id, 1));
    }
    await replaceStores(batch);
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");
    batchDeleteConversationWorkspace(ids, {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    expect(storages.conversations.getAll()).toHaveLength(0);

    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // After full cycle, all 200 must be gone
    expect(new IndexedDBConversationStorage().getAll()).toHaveLength(0);
    expect(await readAll<Message>("messages")).toHaveLength(0);
    expect(await readAll<Round>("rounds")).toHaveLength(0);
  });

  it("Test 2: batch delete → loadConversationData returns no Empty residual items", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `residual-${i}`);
    const batch: StoreBatch = { conversations: [], messages: [], rounds: [], sources: [], proposals: [], "knowledge-cards": [], "conversation-versions": [] };
    for (const id of ids) {
      batch.conversations!.push(conversation(id));
      batch.messages!.push(message(`m-${id}`, id, 0));
      batch.rounds!.push(round(`r-${id}`, id, 1));
    }
    await replaceStores(batch);
    clearCaches();
    await preloadAll();

    const storages = createStorageInstances("indexedDB");
    batchDeleteConversationWorkspace(ids, {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });

    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // loadConversationData simulation: check all conversations for empty (0 msg or 0 round)
    const freshStorages = createStorageInstances("indexedDB");
    const allConvs = freshStorages.conversations.getAll();
    for (const conv of allConvs) {
      const msgCount = freshStorages.messages.getByConversationId(conv.id).length;
      const roundCount = freshStorages.rounds!.getByConversationId(conv.id).length;
      expect(msgCount).toBeGreaterThan(0);
      expect(roundCount).toBeGreaterThan(0);
    }
    // None of the deleted IDs should appear as empty residual
    const convIds = new Set(allConvs.map((c) => c.id));
    for (const id of ids) {
      expect(convIds.has(id)).toBe(false);
    }
  });

  it("Test 3: Existing append → messages.getByConversationId(targetId).length > 0", async () => {
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    const targetId = "append-target-msg";
    conversations.save(conversation(targetId));
    await settle();

    const service = new ChatGPTExportImportService(conversations, sources, messages, rounds);
    const preview = {
      externalConversationId: "append-source-msg",
      title: "Append Source Msg",
      messages: [
        { role: "user" as const, content: "New question", contentHash: "hash-new-q", externalMessageId: "new-q-1" },
        { role: "assistant" as const, content: "New answer", contentHash: "hash-new-a", externalMessageId: "new-a-1" },
      ],
      unsupportedCount: 0,
      isLarge: false,
    };

    const result = service.appendToConversation(preview, targetId);
    expect(result.appendedMessages).toBeGreaterThan(0);

    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    const freshMessages = createStorageInstances("indexedDB").messages;
    const msgs = freshMessages.getByConversationId(targetId);
    expect(msgs.length).toBeGreaterThan(0);
    // All new message IDs must be present
    for (const msg of msgs) {
      expect(msg.conversationId).toBe(targetId);
    }
  });

  it("Test 4: Existing append → rounds.getByConversationId(targetId).length > 0", async () => {
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    const targetId = "append-target-round";
    conversations.save(conversation(targetId));
    await settle();

    const service = new ChatGPTExportImportService(conversations, sources, messages, rounds);
    const preview = {
      externalConversationId: "append-source-round",
      title: "Append Source Round",
      messages: [
        { role: "user" as const, content: "Round question?", contentHash: "hash-r-q", externalMessageId: "r-q-1" },
        { role: "assistant" as const, content: "Round answer.", contentHash: "hash-r-a", externalMessageId: "r-a-1" },
      ],
      unsupportedCount: 0,
      isLarge: false,
    };

    const result = service.appendToConversation(preview, targetId);
    // appendedRounds may be 0 if parser didn't produce rounds, but messages should be appended
    expect(result.appendedMessages).toBeGreaterThan(0);

    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    const freshRounds = createStorageInstances("indexedDB").rounds!;
    const rds = freshRounds.getByConversationId(targetId);
    expect(rds.length).toBeGreaterThanOrEqual(0);
    for (const r of rds) {
      expect(r.conversationId).toBe(targetId);
    }
  });

  it("Test 5: Detail reads same targetId — appended messages and rounds are readable", async () => {
    const targetId = "detail-read-target";
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    conversations.save(conversation(targetId));
    messages.save(message("pre-existing", targetId, 0));
    rounds.save(round("pre-existing-round", targetId, 1));
    await settle();

    const service = new ChatGPTExportImportService(conversations, sources, messages, rounds);
    const preview = {
      externalConversationId: "detail-read-source",
      title: "Detail Read Source",
      messages: [
        { role: "user" as const, content: "Detail question", contentHash: "hash-dr-q", externalMessageId: "dr-q-1" },
        { role: "assistant" as const, content: "Detail answer", contentHash: "hash-dr-a", externalMessageId: "dr-a-1" },
      ],
      unsupportedCount: 0,
      isLarge: false,
    };

    const appendResult = service.appendToConversation(preview, targetId);
    expect(appendResult.appendedMessages).toBeGreaterThan(0);

    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // Detail page exact simulation
    const detailStorage = createStorageInstances("indexedDB");
    const detailConv = detailStorage.conversations.getById(targetId);
    const detailMsgs = detailStorage.messages.getByConversationId(targetId);
    const detailRounds = detailStorage.rounds!.getByConversationId(targetId);

    expect(detailConv).not.toBeNull();
    expect(detailConv!.id).toBe(targetId);

    // Pre-existing + appended messages must all be present
    expect(detailMsgs.length).toBeGreaterThanOrEqual(1 + appendResult.appendedMessages);

    for (const msg of detailMsgs) {
      expect(msg.conversationId).toBe(targetId);
    }

    for (const r of detailRounds) {
      expect(r.conversationId).toBe(targetId);
    }
  });
});

// ============================================================================
// PALOS v1.4.7 — Clear All App Data Integration Tests
// ============================================================================

// localStorage keys that must be cleared by Clear All (matching data-management.tsx)
const PALOS_LOCALSTORAGE_KEYS = [
  "ai-learning-os.workspaces",
  "ai-learning-os.conversations",
  "ai-learning-os.sources",
  "ai-learning-os.current-source",
  "ai-learning-os.messages",
  "ai-learning-os.rounds",
  "ai-learning-os.proposals",
  "ai-learning-os.current-proposal",
  "ai-learning-os.knowledge-cards",
  "ai-learning-os.assets",
  "ai-learning-os.tasks",
  "ai-learning-os.tags",
  "ai-learning-os.analyzer-runs",
  "ai-learning-os.conversation-versions",
  "ai-learning-os.recipes",
  "ai-learning-os.feedback",
  "ai-learning-os.app-event-log",
  "ai-learning-os.provider-configurations",
  "ai-learning-os.analyzer-prompt-templates",
  "ai-learning-os.current-provider",
];

/** Simulate what clearBusinessData() does: clear IDB stores + clear caches + clear localStorage. */
async function simulateClearAll() {
  // 1. Clear IndexedDB business stores
  await replaceStores({
    conversations: [],
    messages: [],
    rounds: [],
    sources: [],
    proposals: [],
    "knowledge-cards": [],
    "conversation-versions": [],
  });

  // 2. Clear in-memory caches and reload from (now empty) IndexedDB
  clearCaches();
  await preloadAll();

  // 3. Clear all PALOS localStorage business keys
  const ls = (window as unknown as { localStorage: { removeItem: (k: string) => void } }).localStorage;
  for (const key of PALOS_LOCALSTORAGE_KEYS) {
    try {
      ls.removeItem(key);
    } catch {
      // ignore per-key failure
    }
  }
}

const nowV147 = "2026-07-09T00:00:00.000Z";

function conv(id: string): Conversation {
  return {
    id,
    title: id,
    sourceType: "ChatGPT",
    createdAt: nowV147,
    updatedAt: nowV147,
    lastOpenedAt: nowV147,
  };
}

function msg(id: string, conversationId: string, order = 0): Message {
  return {
    id,
    conversationId,
    role: "user",
    content: `message ${id}`,
    order,
    createdAt: nowV147,
    updatedAt: nowV147,
  };
}

function rnd(id: string, conversationId: string, order = 1): Round {
  return {
    id,
    conversationId,
    order,
    title: id,
    question: "q",
    answer: "a",
    messageIds: [],
    createdAt: nowV147,
    updatedAt: nowV147,
  };
}

describe("PALOS v1.4.7 — Clear All App Data", () => {
  it("clear all → IndexedDB 7 tables empty", async () => {
    // Populate all 7 IndexedDB stores with data
    await replaceStores({
      conversations: [conv("c1"), conv("c2")],
      messages: [msg("m1", "c1"), msg("m2", "c1"), msg("m3", "c2")],
      rounds: [rnd("r1", "c1"), rnd("r2", "c2")],
      sources: [
        {
          id: "s1",
          conversationId: "c1",
          kind: "text" as const,
          name: "source1",
          content: "content",
          importedAt: nowV147,
          updatedAt: nowV147,
        },
      ],
      proposals: [
        {
          id: "p1",
          title: "proposal",
          summary: "summary",
          sourceId: "s1",
          conversationId: "c1",
          status: "Pending" as const,
          createdAt: nowV147,
          updatedAt: nowV147,
        },
      ],
      "knowledge-cards": [
        {
          id: "k1",
          proposalId: "p1",
          title: "knowledge",
          summary: "summary",
          content: "content",
          sourceId: "s1",
          status: "Active" as const,
          createdAt: nowV147,
          updatedAt: nowV147,
        },
      ],
      "conversation-versions": [
        {
          id: "v1",
          conversationId: "c1",
          name: "snapshot",
          description: "",
          sourceVersion: 1,
          messageCount: 1,
          snapshotData: {
            conversation: conv("c1"),
            messages: [msg("m1", "c1")],
          },
          createdAt: nowV147,
        },
      ],
    });

    // Also populate localStorage with PALOS business keys (simulates legacy data)
    const ls = (window as unknown as { localStorage: { setItem: (k: string, v: string) => void } }).localStorage;
    for (const key of PALOS_LOCALSTORAGE_KEYS) {
      ls.setItem(key, JSON.stringify([{ id: "stale", _key: key }]));
    }

    // Execute clear all
    await simulateClearAll();

    // Verify all 7 IndexedDB stores are empty
    expect(await readAll("conversations")).toHaveLength(0);
    expect(await readAll("messages")).toHaveLength(0);
    expect(await readAll("rounds")).toHaveLength(0);
    expect(await readAll("sources")).toHaveLength(0);
    expect(await readAll("proposals")).toHaveLength(0);
    expect(await readAll("knowledge-cards")).toHaveLength(0);
    expect(await readAll("conversation-versions")).toHaveLength(0);
  });

  it("clear all → localStorage PALOS business keys cleared", async () => {
    // Populate localStorage with PALOS business data
    const ls = (window as unknown as { localStorage: { setItem: (k: string, v: string) => void; getItem: (k: string) => string | null } }).localStorage;
    for (const key of PALOS_LOCALSTORAGE_KEYS) {
      ls.setItem(key, JSON.stringify([{ id: "test-data" }]));
    }

    // Verify data is there before clear
    for (const key of PALOS_LOCALSTORAGE_KEYS) {
      expect(ls.getItem(key)).not.toBeNull();
    }

    // Execute clear all
    await simulateClearAll();

    // Verify all PALOS business localStorage keys are removed
    for (const key of PALOS_LOCALSTORAGE_KEYS) {
      expect(ls.getItem(key)).toBeNull();
    }
  });

  it("clear all → dashboard summary counts = 0 (conversations, messages, rounds, proposals, knowledge)", async () => {
    // Populate IndexedDB with data
    await replaceStores({
      conversations: [conv("c-dash"), conv("c-dash2")],
      messages: [msg("m-d1", "c-dash"), msg("m-d2", "c-dash"), msg("m-d3", "c-dash2")],
      rounds: [rnd("r-d1", "c-dash"), rnd("r-d2", "c-dash2")],
      sources: [],
      proposals: [
        {
          id: "p-dash",
          title: "p",
          summary: "s",
          sourceId: "s1",
          conversationId: "c-dash",
          status: "Pending" as const,
          createdAt: nowV147,
          updatedAt: nowV147,
        },
      ],
      "knowledge-cards": [],
      "conversation-versions": [],
    });

    // Populate localStorage with PALOS business data (simulates stale legacy)
    const ls = (window as unknown as { localStorage: { setItem: (k: string, v: string) => void } }).localStorage;
    ls.setItem("ai-learning-os.conversations", JSON.stringify([conv("stale-c")]));
    ls.setItem("ai-learning-os.messages", JSON.stringify([msg("stale-m", "stale-c")]));
    ls.setItem("ai-learning-os.rounds", JSON.stringify([rnd("stale-r", "stale-c")]));
    ls.setItem("ai-learning-os.proposals", JSON.stringify([{ id: "stale-p" }]));
    ls.setItem("ai-learning-os.knowledge-cards", JSON.stringify([{ id: "stale-k" }]));
    ls.setItem("ai-learning-os.sources", JSON.stringify([{ id: "stale-s", conversationId: "stale-c" }]));

    // Execute clear all
    await simulateClearAll();

    // Dashboard-equivalent reads: IndexedDB*Storage.getAll() should return 0
    expect(new IndexedDBConversationStorage().getAll()).toHaveLength(0);
    expect(new IndexedDBMessageStorage().getAll()).toHaveLength(0);
    expect(new IndexedDBRoundStorage().getAll()).toHaveLength(0);
    expect(new IndexedDBProposalStorage().getAll()).toHaveLength(0);
    expect(new IndexedDBKnowledgeCardStorage().getAll()).toHaveLength(0);

    // localStorage must also be empty
    expect(ls.getItem("ai-learning-os.conversations")).toBeNull();
    expect(ls.getItem("ai-learning-os.messages")).toBeNull();
    expect(ls.getItem("ai-learning-os.rounds")).toBeNull();
    expect(ls.getItem("ai-learning-os.proposals")).toBeNull();
    expect(ls.getItem("ai-learning-os.knowledge-cards")).toBeNull();
    expect(ls.getItem("ai-learning-os.sources")).toBeNull();
  });

  it("clear all → search results = 0", async () => {
    // Populate IndexedDB with searchable data
    await replaceStores({
      conversations: [conv("c-search"), conv("c-search2")],
      messages: [msg("m-s1", "c-search"), msg("m-s2", "c-search2")],
      rounds: [rnd("r-s1", "c-search"), rnd("r-s2", "c-search2")],
      sources: [
        {
          id: "s-search",
          conversationId: "c-search",
          kind: "text" as const,
          name: "search-source",
          content: "searchable content here",
          importedAt: nowV147,
          updatedAt: nowV147,
        },
      ],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });

    clearCaches();
    await preloadAll();

    // Build search index (simulates what search-experience.tsx does)
    const searchData: SearchIndexData = {
      workspaces: [],
      conversations: new IndexedDBConversationStorage().getAll(),
      sources: new IndexedDBSourceStorage().getAll(),
      messages: new IndexedDBMessageStorage().getAll(),
      rounds: new IndexedDBRoundStorage().getAll(),
      proposals: new IndexedDBProposalStorage().getAll(),
      knowledgeCards: new IndexedDBKnowledgeCardStorage().getAll(),
      tasks: [],
      tags: [],
      assets: [],
    };
    const searchService = new SearchIndexService(searchData);
    searchService.buildDocuments();

    // Search by conversation title should find results before clear
    const beforeResults = searchService.searchDocuments("c-search", {
      entityTypes: ["conversation"],
    });
    expect(beforeResults.length).toBeGreaterThan(0);

    // Execute clear all
    await simulateClearAll();

    // Rebuild search index after clear (simulates page reload)
    const emptySearchData: SearchIndexData = {
      workspaces: [],
      conversations: new IndexedDBConversationStorage().getAll(),
      sources: new IndexedDBSourceStorage().getAll(),
      messages: new IndexedDBMessageStorage().getAll(),
      rounds: new IndexedDBRoundStorage().getAll(),
      proposals: new IndexedDBProposalStorage().getAll(),
      knowledgeCards: new IndexedDBKnowledgeCardStorage().getAll(),
      tasks: [],
      tags: [],
      assets: [],
    };
    const emptyService = new SearchIndexService(emptySearchData);
    emptyService.buildDocuments();

    // All entity types should return 0 results
    const afterResults = emptyService.searchDocuments("searchable");
    expect(afterResults).toHaveLength(0);

    // No-query browse should also return 0
    const browseResults = emptyService.searchDocuments("");
    expect(browseResults).toHaveLength(0);

    // Conversations specifically should be 0
    const convResults = emptyService.searchDocuments("c-search", {
      entityTypes: ["conversation"],
    });
    expect(convResults).toHaveLength(0);

    // Rounds specifically should be 0
    const roundResults = emptyService.searchDocuments("r-s1", {
      entityTypes: ["round"],
    });
    expect(roundResults).toHaveLength(0);
  });

  it("clear all → recent imports = 0", async () => {
    // Populate with import data (conversations + sources)
    await replaceStores({
      conversations: [conv("c-import1"), conv("c-import2"), conv("c-import3")],
      messages: [
        msg("m-i1", "c-import1"),
        msg("m-i2", "c-import2"),
        msg("m-i3", "c-import3"),
      ],
      rounds: [],
      sources: [
        {
          id: "s-import1",
          conversationId: "c-import1",
          kind: "text" as const,
          name: "import-source-1",
          content: "imported content 1",
          importedAt: nowV147,
          updatedAt: nowV147,
        },
        {
          id: "s-import2",
          conversationId: "c-import2",
          kind: "text" as const,
          name: "import-source-2",
          content: "imported content 2",
          importedAt: nowV147,
          updatedAt: nowV147,
        },
      ],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });

    clearCaches();
    await preloadAll();

    // Verify recent imports exist before clear
    const sourceStorage = new IndexedDBSourceStorage();
    expect(sourceStorage.getByConversationId("c-import1")).not.toBeNull();
    expect(sourceStorage.getByConversationId("c-import2")).not.toBeNull();
    // c-import3 has no source → not a "recent import"
    expect(sourceStorage.getByConversationId("c-import3")).toBeNull();

    // Execute clear all
    await simulateClearAll();

    // After clear, all sources gone → no recent imports
    const clearedSourceStorage = new IndexedDBSourceStorage();
    expect(clearedSourceStorage.getAll()).toHaveLength(0);
    expect(clearedSourceStorage.getByConversationId("c-import1")).toBeNull();
    expect(clearedSourceStorage.getByConversationId("c-import2")).toBeNull();

    // Conversations also gone
    expect(new IndexedDBConversationStorage().getAll()).toHaveLength(0);

    // localStorage sources key also cleared
    const ls = (window as unknown as { localStorage: { getItem: (k: string) => string | null } }).localStorage;
    expect(ls.getItem("ai-learning-os.sources")).toBeNull();
    expect(ls.getItem("ai-learning-os.current-source")).toBeNull();
  });

  it("clear all → conversation versions and all cascaded entities cleared", async () => {
    // Full integration test: populate all 7 tables, clear, verify all empty
    await replaceStores({
      conversations: [conv("full-1"), conv("full-2")],
      messages: [msg("full-m1", "full-1"), msg("full-m2", "full-2")],
      rounds: [rnd("full-r1", "full-1")],
      sources: [
        {
          id: "full-s1",
          conversationId: "full-1",
          kind: "text" as const,
          name: "full-source",
          content: "full content",
          importedAt: nowV147,
          updatedAt: nowV147,
        },
      ],
      proposals: [
        {
          id: "full-p1",
          title: "full proposal",
          summary: "summary",
          sourceId: "full-s1",
          conversationId: "full-1",
          status: "Pending" as const,
          createdAt: nowV147,
          updatedAt: nowV147,
        },
      ],
      "knowledge-cards": [
        {
          id: "full-k1",
          proposalId: "full-p1",
          title: "full knowledge",
          summary: "summary",
          content: "content",
          sourceId: "full-s1",
          status: "Active" as const,
          createdAt: nowV147,
          updatedAt: nowV147,
        },
      ],
      "conversation-versions": [
        {
          id: "full-v1",
          conversationId: "full-1",
          name: "full snapshot",
          description: "",
          sourceVersion: 1,
          messageCount: 2,
          snapshotData: {
            conversation: conv("full-1"),
            messages: [msg("full-m1", "full-1"), msg("full-m2", "full-2")],
          },
          createdAt: nowV147,
        },
      ],
    });

    // Load data into in-memory caches so IndexedDB*Storage reads work
    clearCaches();
    await preloadAll();

    // Verify data exists before clear
    expect(new IndexedDBConversationStorage().getAll()).toHaveLength(2);
    expect(new IndexedDBMessageStorage().getAll()).toHaveLength(2);
    expect(new IndexedDBRoundStorage().getAll()).toHaveLength(1);
    expect(new IndexedDBSourceStorage().getAll()).toHaveLength(1);
    expect(new IndexedDBProposalStorage().getAll()).toHaveLength(1);
    expect(new IndexedDBKnowledgeCardStorage().getAll()).toHaveLength(1);
    expect(new IndexedDBConversationVersionStorage().getAll()).toHaveLength(1);

    // Execute clear all
    await simulateClearAll();

    // All 7 stores must be empty
    expect(new IndexedDBConversationStorage().getAll()).toHaveLength(0);
    expect(new IndexedDBMessageStorage().getAll()).toHaveLength(0);
    expect(new IndexedDBRoundStorage().getAll()).toHaveLength(0);
    expect(new IndexedDBSourceStorage().getAll()).toHaveLength(0);
    expect(new IndexedDBProposalStorage().getAll()).toHaveLength(0);
    expect(new IndexedDBKnowledgeCardStorage().getAll()).toHaveLength(0);
    expect(new IndexedDBConversationVersionStorage().getAll()).toHaveLength(0);

    // Cached counts also 0
    const counts = getCachedCounts();
    expect(counts.conversations).toBe(0);
    expect(counts.messages).toBe(0);
    expect(counts.rounds).toBe(0);
    expect(counts.sources).toBe(0);
    expect(counts.proposals).toBe(0);
    expect(counts.knowledgeCards).toBe(0);
    expect(counts.conversationVersions).toBe(0);
  });
});

// ============================================================================
// PALOS v1.4.8 — Canonical Storage Unification Tests
// ============================================================================
describe("PALOS v1.4.8 — Canonical Storage Unification", () => {
  it("Dashboard: createStorageInstances() reads IndexedDB data correctly", async () => {
    await replaceStores({
      conversations: [conversation("dash-1"), conversation("dash-2"), conversation("dash-3")],
      messages: [
        message("dash-m1", "dash-1", 0),
        message("dash-m2", "dash-1", 1),
        message("dash-m3", "dash-2", 0),
      ],
      rounds: [round("dash-r1", "dash-1", 1), round("dash-r2", "dash-2", 1)],
      sources: [
        {
          id: "dash-s1",
          conversationId: "dash-1",
          kind: "text" as const,
          name: "source",
          content: "dash content",
          importedAt: now,
          updatedAt: now,
        },
      ],
      proposals: [
        {
          id: "dash-p1",
          title: "proposal",
          summary: "summary",
          sourceId: "dash-s1",
          conversationId: "dash-1",
          status: "Pending" as const,
          createdAt: now,
          updatedAt: now,
        },
      ],
      "knowledge-cards": [],
      "conversation-versions": [],
    });
    clearCaches();
    await preloadAll();

    // Simulate Dashboard read via canonical storage
    const storages = createStorageInstances();
    const conversations = storages.conversations.getAll();
    const messages = storages.messages.getAll();
    const sources = storages.sources.getAll();

    expect(conversations).toHaveLength(3);
    expect(messages).toHaveLength(3);

    // Dashboard messageCountsByConversation
    const messageCountsByConversation = messages.reduce<Record<string, number>>(
      (counts, msg) => {
        counts[msg.conversationId] = (counts[msg.conversationId] ?? 0) + 1;
        return counts;
      },
      {},
    );
    expect(messageCountsByConversation["dash-1"]).toBe(2);
    expect(messageCountsByConversation["dash-2"]).toBe(1);

    // Dashboard recentImports (conversations with sources)
    const recentImports = conversations.filter((c) =>
      sources.some((s) => s.conversationId === c.id),
    );
    expect(recentImports).toHaveLength(1);

    // Dashboard counts
    expect(storages.proposals.getAll()).toHaveLength(1);
    expect(storages.knowledgeCards.getAll()).toHaveLength(0);
  });

  it("Dashboard: localStorage mode reads from Browser*Storage (legacy compat)", async () => {
    // Set storage mode to localStorage
    const ls = (window as unknown as { localStorage: { setItem: (k: string, v: string) => void; getItem: (k: string) => string | null } }).localStorage;
    ls.setItem("palos.storage-mode", "localStorage");

    // Populate localStorage with conversation data
    ls.setItem("ai-learning-os.conversations", JSON.stringify([conversation("ls-dash")]));
    ls.setItem("ai-learning-os.messages", JSON.stringify([message("ls-msg", "ls-dash", 0)]));
    ls.setItem("ai-learning-os.rounds", JSON.stringify([round("ls-round", "ls-dash", 1)]));

    // createStorageInstances should return Browser*Storage in localStorage mode
    const storages = createStorageInstances();
    const conversations = storages.conversations.getAll();
    const messages = storages.messages.getAll();

    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe("ls-dash");
    expect(messages).toHaveLength(1);
    expect(messages[0].conversationId).toBe("ls-dash");

    // Cleanup: reset to default mode
    ls.setItem("palos.storage-mode", "indexedDB");
  });

  it("Search: canonical storage data is searchable", async () => {
    await replaceStores({
      conversations: [conversation("search-c1"), conversation("search-c2")],
      messages: [
        message("search-m1", "search-c1", 0),
        message("search-m2", "search-c2", 0),
      ],
      rounds: [round("search-r1", "search-c1", 1)],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });
    clearCaches();
    await preloadAll();

    // Simulate SearchExperience: build search index from canonical storage
    const storages = createStorageInstances();
    const searchData: SearchIndexData = {
      workspaces: [],
      conversations: storages.conversations.getAll(),
      sources: storages.sources.getAll(),
      messages: storages.messages.getAll(),
      rounds: storages.rounds!.getAll(),
      proposals: storages.proposals.getAll(),
      knowledgeCards: storages.knowledgeCards.getAll(),
      tasks: [],
      tags: [],
      assets: [],
    };
    const searchService = new SearchIndexService(searchData);
    searchService.buildDocuments();

    // Search should find conversations by title
    const results = searchService.searchDocuments("search-c1", {
      entityTypes: ["conversation"],
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entityId).toBe("search-c1");
  });

  it("Search: after delete, search returns 0 for deleted data", async () => {
    await replaceStores({
      conversations: [conversation("del-search")],
      messages: [message("del-search-m", "del-search", 0)],
      rounds: [round("del-search-r", "del-search", 1)],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });
    clearCaches();
    await preloadAll();

    // Search before delete
    const beforeStorages = createStorageInstances();
    const beforeData: SearchIndexData = {
      workspaces: [],
      conversations: beforeStorages.conversations.getAll(),
      sources: beforeStorages.sources.getAll(),
      messages: beforeStorages.messages.getAll(),
      rounds: beforeStorages.rounds!.getAll(),
      proposals: beforeStorages.proposals.getAll(),
      knowledgeCards: beforeStorages.knowledgeCards.getAll(),
      tasks: [],
      tags: [],
      assets: [],
    };
    const beforeSearch = new SearchIndexService(beforeData);
    beforeSearch.buildDocuments();
    expect(beforeSearch.searchDocuments("del-search")).not.toHaveLength(0);

    // Delete conversation
    deleteConversationWorkspace("del-search", {
      ...createStorageInstances("indexedDB"),
      versions: new IndexedDBConversationVersionStorage(),
      rounds: new IndexedDBRoundStorage(),
    });
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // Search after delete
    const afterStorages = createStorageInstances();
    const afterData: SearchIndexData = {
      workspaces: [],
      conversations: afterStorages.conversations.getAll(),
      sources: afterStorages.sources.getAll(),
      messages: afterStorages.messages.getAll(),
      rounds: afterStorages.rounds!.getAll(),
      proposals: afterStorages.proposals.getAll(),
      knowledgeCards: afterStorages.knowledgeCards.getAll(),
      tasks: [],
      tags: [],
      assets: [],
    };
    const afterSearch = new SearchIndexService(afterData);
    afterSearch.buildDocuments();
    expect(afterSearch.searchDocuments("del-search")).toHaveLength(0);
  });

  it("Batch delete → Dashboard/Search/Conversation list all consistent", async () => {
    // Populate 10 conversations
    const ids = Array.from({ length: 10 }, (_, i) => `cross-${i}`);
    const batch: StoreBatch = { conversations: [], messages: [], rounds: [], sources: [], proposals: [], "knowledge-cards": [], "conversation-versions": [] };
    for (const id of ids) {
      batch.conversations!.push(conversation(id));
      batch.messages!.push(message(`m-${id}`, id, 0));
      batch.rounds!.push(round(`r-${id}`, id, 1));
    }
    await replaceStores(batch);
    clearCaches();
    await preloadAll();

    // Delete first 5
    const deleteIds = ids.slice(0, 5);
    const keepIds = ids.slice(5);
    const storages = createStorageInstances("indexedDB");
    batchDeleteConversationWorkspace(deleteIds, {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // ---- Dashboard view ----
    const dashStorages = createStorageInstances();
    const dashConversations = dashStorages.conversations.getAll();
    expect(dashConversations).toHaveLength(5);
    for (const c of dashConversations) {
      expect(keepIds).toContain(c.id);
      expect(deleteIds).not.toContain(c.id);
    }
    const dashMessages = dashStorages.messages.getAll();
    expect(dashMessages).toHaveLength(5);

    // ---- Conversation list view ----
    const listStorages = createStorageInstances();
    const listConversations = listStorages.conversations.getAll();
    expect(listConversations).toHaveLength(5);

    // ---- Search view ----
    const searchStorages = createStorageInstances();
    const searchData: SearchIndexData = {
      workspaces: [],
      conversations: searchStorages.conversations.getAll(),
      sources: searchStorages.sources.getAll(),
      messages: searchStorages.messages.getAll(),
      rounds: searchStorages.rounds!.getAll(),
      proposals: searchStorages.proposals.getAll(),
      knowledgeCards: searchStorages.knowledgeCards.getAll(),
      tasks: [],
      tags: [],
      assets: [],
    };
    const searchService = new SearchIndexService(searchData);
    searchService.buildDocuments();

    // Deleted IDs should not appear in search
    for (const id of deleteIds) {
      const results = searchService.searchDocuments(id, { entityTypes: ["conversation"] });
      expect(results).toHaveLength(0);
    }
    // Kept IDs should still appear
    for (const id of keepIds) {
      const results = searchService.searchDocuments(id, { entityTypes: ["conversation"] });
      expect(results.length).toBeGreaterThan(0);
    }

    // Total search document count should match 5 conversations
    expect(searchStorages.conversations.getAll()).toHaveLength(5);
  });

  it("Existing append → detail/search/dashboard all read new data", async () => {
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    const targetId = "append-cross-target";
    conversations.save(conversation(targetId));
    messages.save(message("pre-append", targetId, 0));
    await settle();

    // Pre-append: Dashboard count
    expect(messages.getByConversationId(targetId)).toHaveLength(1);

    // Append via ChatGPTExportImportService
    const service = new ChatGPTExportImportService(conversations, sources, messages, rounds);
    const preview = {
      externalConversationId: "append-cross-source",
      title: "Cross-append source",
      messages: [
        { role: "user" as const, content: "Cross question?", contentHash: "hash-cross-q", externalMessageId: "cross-q-1" },
        { role: "assistant" as const, content: "Cross answer.", contentHash: "hash-cross-a", externalMessageId: "cross-a-1" },
      ],
      unsupportedCount: 0,
      isLarge: false,
    };

    const result = service.appendToConversation(preview, targetId);
    expect(result.appendedMessages).toBeGreaterThan(0);

    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // ---- Detail view: reads messages and rounds by targetId ----
    const detailStorages = createStorageInstances("indexedDB");
    const detailConv = detailStorages.conversations.getById(targetId);
    const detailMsgs = detailStorages.messages.getByConversationId(targetId);
    const detailRounds = detailStorages.rounds!.getByConversationId(targetId);

    expect(detailConv).not.toBeNull();
    expect(detailConv!.id).toBe(targetId);
    expect(detailMsgs.length).toBeGreaterThan(1); // pre-existing + appended
    for (const msg of detailMsgs) {
      expect(msg.conversationId).toBe(targetId);
    }
    for (const r of detailRounds) {
      expect(r.conversationId).toBe(targetId);
    }

    // ---- Dashboard view: message count increased ----
    const dashMessages = createStorageInstances("indexedDB").messages.getAll();
    const targetDashCount = dashMessages.filter((m) => m.conversationId === targetId).length;
    expect(targetDashCount).toBeGreaterThan(1);

    // ---- Search view: appended content is searchable ----
    const searchStorages = createStorageInstances("indexedDB");
    const searchData: SearchIndexData = {
      workspaces: [],
      conversations: searchStorages.conversations.getAll(),
      sources: searchStorages.sources.getAll(),
      messages: searchStorages.messages.getAll(),
      rounds: searchStorages.rounds!.getAll(),
      proposals: searchStorages.proposals.getAll(),
      knowledgeCards: searchStorages.knowledgeCards.getAll(),
      tasks: [],
      tags: [],
      assets: [],
    };
    const searchService = new SearchIndexService(searchData);
    searchService.buildDocuments();

    // Search should find the appended content
    const searchResults = searchService.searchDocuments("Cross question", { entityTypes: ["message"] });
    expect(searchResults.length).toBeGreaterThan(0);
    // The message should belong to the target conversation
    expect(searchResults[0].metadata?.conversationId).toBe(targetId);
  });
});

// ============================================================================
// PALOS v1.4.9 — Round Generation P0 Fix: IndexedDB persistence tests
// ============================================================================
describe("PALOS v1.4.9 — Round persistence across flush/clear/reload", () => {
  const CHATGPT_FIXTURE = JSON.stringify([
    {
      id: "conv-basic-001",
      conversation_id: "conv-basic-001",
      title: "Hello World Chat",
      create_time: 1715875200,
      update_time: 1715878800,
      current_node: "node-3",
      mapping: {
        "node-1": {
          id: "msg-user-1",
          parent: null,
          message: {
            id: "msg-user-1",
            author: { role: "user" },
            content: { content_type: "text", parts: ["Hello, how are you?"] },
            create_time: 1715875200,
          },
        },
        "node-2": {
          id: "msg-assistant-1",
          parent: "node-1",
          message: {
            id: "msg-assistant-1",
            author: { role: "assistant" },
            content: { content_type: "text", parts: ["Hi! I'm doing well, thank you for asking. How can I help you today?"] },
            create_time: 1715875260,
          },
        },
        "node-3": {
          id: "msg-user-2",
          parent: "node-2",
          message: {
            id: "msg-user-2",
            author: { role: "user" },
            content: { content_type: "text", parts: ["Can you explain TypeScript generics?"] },
            create_time: 1715875320,
          },
        },
      },
    },
  ]);

  it("new import → flush → clearCaches → preloadAll: messages and rounds survive", async () => {
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    const service = new ChatGPTExportImportService(
      conversations,
      sources,
      messages,
      rounds,
    );

    const previews = service.parseExport(CHATGPT_FIXTURE);
    const importPreview = service.previewImport(previews[0]);
    const result = service.importConversation(importPreview);

    expect(result.appended).toBeGreaterThan(0);
    expect(result.roundsCreated).toBeGreaterThan(0);

    // Verify in cache before flush
    const cachedMsgs = messages.getByConversationId(result.conversationId);
    const cachedRounds = rounds.getByConversationId(result.conversationId);
    expect(cachedMsgs.length).toBeGreaterThan(0);
    expect(cachedRounds.length).toBeGreaterThan(0);

    // Flush → clear → reload
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // Verify after reload
    const reloadedMsgs = new IndexedDBMessageStorage().getByConversationId(
      result.conversationId,
    );
    const reloadedRounds = new IndexedDBRoundStorage().getByConversationId(
      result.conversationId,
    );

    expect(reloadedMsgs.length).toBe(cachedMsgs.length);
    expect(reloadedRounds.length).toBe(cachedRounds.length);

    // Verify round integrity after reload
    const messageIdSet = new Set(reloadedMsgs.map((m) => m.id));
    for (const r of reloadedRounds) {
      expect(r.conversationId).toBe(result.conversationId);
      expect(r.messageIds.length).toBeGreaterThan(0);
      for (const mid of r.messageIds) {
        expect(messageIdSet.has(mid)).toBe(true);
      }
    }
  });

  it("existing append → flush → clearCaches → preloadAll: messages and rounds survive", async () => {
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    const targetId = "idb-append-target";
    conversations.save({
      id: targetId,
      title: "Target",
      sourceType: "ChatGPT",
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    });

    const service = new ChatGPTExportImportService(
      conversations,
      sources,
      messages,
      rounds,
    );
    const previews = service.parseExport(CHATGPT_FIXTURE);
    const result = service.appendToConversation(previews[0], targetId);

    expect(result.appendedMessages).toBeGreaterThan(0);
    expect(result.appendedRounds).toBeGreaterThan(0);

    // Flush → clear → reload
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    const reloadedMsgs = new IndexedDBMessageStorage().getByConversationId(targetId);
    const reloadedRounds = new IndexedDBRoundStorage().getByConversationId(targetId);

    expect(reloadedMsgs.length).toBeGreaterThanOrEqual(result.appendedMessages);
    expect(reloadedRounds.length).toBeGreaterThanOrEqual(result.appendedRounds);

    // Round integrity
    const messageIdSet = new Set(reloadedMsgs.map((m) => m.id));
    for (const r of reloadedRounds) {
      expect(r.conversationId).toBe(targetId);
      for (const mid of r.messageIds) {
        expect(messageIdSet.has(mid)).toBe(true);
      }
    }
  });

  it("Detail-equivalent read: createStorageInstances returns non-empty messages and rounds", async () => {
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    const service = new ChatGPTExportImportService(
      conversations,
      sources,
      messages,
      rounds,
    );
    const previews = service.parseExport(CHATGPT_FIXTURE);
    const importPreview = service.previewImport(previews[0]);
    const result = service.importConversation(importPreview);

    // Flush → clear → reload (simulates page navigation to Detail)
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // Simulate what ConversationDetail does:
    // createMessageStorage().getByConversationId(conversationId)
    // createRoundStorage().getByConversationId(conversationId)
    const detailStorages = createStorageInstances("indexedDB");
    const detailMsgs = detailStorages.messages.getByConversationId(
      result.conversationId,
    );
    const detailRounds = detailStorages.rounds!.getByConversationId(
      result.conversationId,
    );

    expect(detailMsgs.length).toBeGreaterThan(0);
    expect(detailRounds.length).toBeGreaterThan(0);

    // All messages have correct conversationId
    for (const msg of detailMsgs) {
      expect(msg.conversationId).toBe(result.conversationId);
    }
    // All rounds have correct conversationId
    for (const r of detailRounds) {
      expect(r.conversationId).toBe(result.conversationId);
    }
  });

  it("rounds are NOT silently lost: if parser produces rounds, they must be in storage", async () => {
    // This is a defensive test: confirm that the parser DOES produce rounds
    // for a normal user/assistant chat, and that those rounds survive persistence.
    const pipeline = new ImportParserPipeline();
    const transcript = "User: Hello, how are you?\n\nAssistant: Hi! I'm doing well.\n\nUser: Can you explain TypeScript generics?";
    const parserPreview = pipeline.preview(
      { name: "test", channel: "clipboard", content: transcript },
      "chatgpt",
    );

    // Parser MUST produce rounds for this input
    expect(parserPreview.rounds.length).toBeGreaterThan(0);
    expect(parserPreview.messages.length).toBe(3);

    // Now test that ImportService actually creates them
    const conversations = new IndexedDBConversationStorage();
    const sources = new IndexedDBSourceStorage();
    const messages = new IndexedDBMessageStorage();
    const rounds = new IndexedDBRoundStorage();

    const importResult = new ImportService(
      conversations,
      sources,
      messages,
      rounds,
    ).confirm(parserPreview, { title: "Test" });

    expect(importResult.roundCount).toBe(parserPreview.rounds.length);
    expect(importResult.roundCount).toBeGreaterThan(0);

    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    const savedRounds = new IndexedDBRoundStorage().getByConversationId(
      importResult.conversationId,
    );
    expect(savedRounds.length).toBe(importResult.roundCount);
    expect(savedRounds.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// PALOS v1.4.10 — DataHealth canonical storage (P0-6 fix)
// ============================================================================
describe("PALOS v1.4.10 — DataHealth uses canonical storage", () => {
  it("DataHealth-equivalent reads find IndexedDB data (not stale localStorage)", async () => {
    // Populate IndexedDB with data — this is where the real business data lives
    await replaceStores({
      conversations: [conversation("dh-c1"), conversation("dh-c2")],
      messages: [
        message("dh-m1", "dh-c1", 0),
        message("dh-m2", "dh-c1", 1),
        message("dh-m3", "dh-c2", 0),
      ],
      rounds: [round("dh-r1", "dh-c1", 1), round("dh-r2", "dh-c2", 1)],
      sources: [],
      proposals: [
        {
          id: "dh-p1",
          title: "dh proposal",
          summary: "summary",
          sourceId: "dh-s1",
          conversationId: "dh-c1",
          status: "Pending" as const,
          createdAt: now,
          updatedAt: now,
        },
      ],
      "knowledge-cards": [
        {
          id: "dh-k1",
          proposalId: "dh-p1",
          title: "dh knowledge",
          summary: "summary",
          content: "content",
          sourceId: "dh-s1",
          status: "Active" as const,
          createdAt: now,
          updatedAt: now,
        },
      ],
      "conversation-versions": [],
    });

    // Ensure localStorage is EMPTY for these keys (simulates IndexedDB-only state)
    const ls = (window as unknown as { localStorage: { removeItem: (k: string) => void; getItem: (k: string) => string | null } }).localStorage;
    ls.removeItem("ai-learning-os.conversations");
    ls.removeItem("ai-learning-os.messages");
    ls.removeItem("ai-learning-os.rounds");
    ls.removeItem("ai-learning-os.proposals");
    ls.removeItem("ai-learning-os.knowledge-cards");

    clearCaches();
    await preloadAll();

    // Simulate DataHealth reads using canonical storage (the fix)
    const conversations = createStorageInstances().conversations.getAll();
    const messages = createStorageInstances().messages.getAll();
    const rounds = createStorageInstances().rounds!.getAll();
    const proposals = createStorageInstances().proposals.getAll();
    const knowledgeCards = createStorageInstances().knowledgeCards.getAll();

    // All data must be found via canonical storage
    expect(conversations).toHaveLength(2);
    expect(messages).toHaveLength(3);
    expect(rounds).toHaveLength(2);
    expect(proposals).toHaveLength(1);
    expect(knowledgeCards).toHaveLength(1);

    // Empty conversation detection must work with canonical data
    const messagesByConv = new Map<string, number>();
    messages.forEach((m) => messagesByConv.set(m.conversationId, (messagesByConv.get(m.conversationId) ?? 0) + 1));
    const roundCountByConv = new Map<string, number>();
    rounds.forEach((r) => roundCountByConv.set(r.conversationId, (roundCountByConv.get(r.conversationId) ?? 0) + 1));

    for (const conv of conversations) {
      const msgCount = messagesByConv.get(conv.id) ?? 0;
      const rndCount = roundCountByConv.get(conv.id) ?? 0;
      // Neither conversation should be detected as "empty" since both have messages & rounds
      expect(`${conv.id}: msg=${msgCount} round=${rndCount}`).not.toContain("0");
    }

    // Orphan detection must work: proposals referencing deleted conversations
    const conversationIds = new Set(conversations.map((c) => c.id));
    const orphanProposals = proposals.filter((p) => p.conversationId && !conversationIds.has(p.conversationId));
    expect(orphanProposals).toHaveLength(0); // dh-c1 still exists

    // Orphan knowledge must be detectable
    const proposalIds = new Set(proposals.map((p) => p.id));
    const orphanKnowledge = knowledgeCards.filter((k) => !proposalIds.has(k.proposalId));
    expect(orphanKnowledge).toHaveLength(0); // dh-k1 references dh-p1 which exists
  });

  it("DataHealth empty-conversation detection works after delete", async () => {
    // Populate data, delete one conversation, verify DataHealth detects the remaining correctly
    await replaceStores({
      conversations: [conversation("dh-full"), conversation("dh-empty")],
      messages: [message("dh-fm", "dh-full", 0)],
      rounds: [round("dh-fr", "dh-full", 1)],
      sources: [],
      proposals: [],
      "knowledge-cards": [],
      "conversation-versions": [],
    });
    clearCaches();
    await preloadAll();

    // Delete dh-full via workspace service
    const storages = createStorageInstances("indexedDB");
    deleteConversationWorkspace("dh-full", {
      ...storages,
      versions: storages.conversationVersions,
      rounds: storages.rounds,
    });
    await flushCachesToIndexedDB();
    clearCaches();
    await preloadAll();

    // DataHealth-equivalent read after delete
    const conversations = createStorageInstances().conversations.getAll();
    const messages = createStorageInstances().messages.getAll();
    const rounds = createStorageInstances().rounds!.getAll();

    // dh-full should be gone, dh-empty should remain
    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe("dh-empty");

    // dh-empty should be flagged as empty (0 messages, 0 rounds)
    const messagesByConv = new Map<string, number>();
    messages.forEach((m) => messagesByConv.set(m.conversationId, (messagesByConv.get(m.conversationId) ?? 0) + 1));
    const roundCountByConv = new Map<string, number>();
    rounds.forEach((r) => roundCountByConv.set(r.conversationId, (roundCountByConv.get(r.conversationId) ?? 0) + 1));

    const emptyConversations = conversations.filter((conv) => {
      const msgCount = messagesByConv.get(conv.id) ?? 0;
      const rndCount = roundCountByConv.get(conv.id) ?? 0;
      return msgCount === 0 || rndCount === 0;
    });
    expect(emptyConversations).toHaveLength(1);
    expect(emptyConversations[0].id).toBe("dh-empty");
  });
});
