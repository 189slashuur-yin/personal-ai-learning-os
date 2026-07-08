import { beforeEach, describe, expect, it } from "vitest";
import type { Conversation } from "@/core/entities/conversation";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { ChatGPTExportImportService } from "@/core/services/chatgpt-export-import";
import { deleteConversationWorkspace } from "@/core/services/conversation-workspace";
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
} from "@/infrastructure/storage/indexeddb/database";
import {
  clearCaches,
  flushCachesToIndexedDB,
  preloadAll,
} from "@/infrastructure/storage/indexeddb/preload";
import { IndexedDBConversationStorage } from "@/infrastructure/storage/indexeddb/idb-conversation-storage";
import { IndexedDBMessageStorage } from "@/infrastructure/storage/indexeddb/idb-message-storage";
import { IndexedDBRoundStorage } from "@/infrastructure/storage/indexeddb/idb-round-storage";
import { IndexedDBSourceStorage } from "@/infrastructure/storage/indexeddb/idb-source-storage";

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
});
