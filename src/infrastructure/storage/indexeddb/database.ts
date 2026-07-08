const DB_NAME = "palos-db";
const DB_VERSION = 1;

const STORE_NAMES = [
  "conversations",
  "messages",
  "rounds",
  "sources",
  "proposals",
  "knowledge-cards",
  "conversation-versions",
] as const;

export type StoreName = (typeof STORE_NAMES)[number];
export type StoreBatch = Partial<Record<StoreName, unknown[]>>;

let _db: IDBDatabase | null = null;
let _openPromise: Promise<IDBDatabase> | null = null;

export function openPalosDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_openPromise) return _openPromise;

  _openPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };

    request.onsuccess = (event) => {
      _db = (event.target as IDBOpenDBRequest).result;
      _db.onclose = () => {
        _db = null;
        _openPromise = null;
      };
      resolve(_db);
    };

    request.onerror = (event) => {
      _openPromise = null;
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return _openPromise;
}

export function closePalosDB(): void {
  if (_db) {
    _db.close();
    _db = null;
    _openPromise = null;
  }
}

function requestError(request: IDBRequest | IDBTransaction): Error {
  return request.error ?? new Error("IndexedDB transaction failed.");
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(requestError(transaction));
    transaction.onabort = () => reject(requestError(transaction));
  });
}

function notifyWriteFailure(operation: string, error: unknown): void {
  console.error(`[IndexedDB] ${operation} failed`, error);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("palos:indexeddb-write-error", {
        detail: { operation, error },
      }),
    );
  }
}

export function reportAsyncWriteFailure(
  operation: string,
  error: unknown,
): void {
  notifyWriteFailure(operation, error);
}

export function persistInBackground(
  operation: string,
  promise: Promise<void>,
): void {
  promise.catch((error) => notifyWriteFailure(operation, error));
}

/** Read all records from an object store. */
export async function readAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openPalosDB();
  return new Promise<T[]>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

/** Write a single record (insert or update via put). */
export async function writeOne<T>(storeName: StoreName, record: T): Promise<void> {
  const db = await openPalosDB();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(record);
  return transactionDone(transaction);
}

/** Write many records in a single transaction. */
export async function writeMany<T>(storeName: StoreName, records: T[]): Promise<void> {
  const db = await openPalosDB();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  for (const record of records) {
    store.put(record);
  }
  return transactionDone(transaction);
}

/** Delete a single record by key. */
export async function deleteOne(storeName: StoreName, id: string): Promise<void> {
  const db = await openPalosDB();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(id);
  return transactionDone(transaction);
}

/** Delete many records by primary key in one transaction. */
export async function deleteMany(
  storeName: StoreName,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const db = await openPalosDB();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  for (const id of ids) {
    store.delete(id);
  }
  return transactionDone(transaction);
}

/** Delete records matching a predicate using a cursor in one transaction. */
export async function deleteWhere<T>(
  storeName: StoreName,
  predicate: (record: T) => boolean,
): Promise<void> {
  const db = await openPalosDB();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  const request = store.openCursor();

  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    if (predicate(cursor.value as T)) {
      cursor.delete();
    }
    cursor.continue();
  };

  return transactionDone(transaction);
}

/** Replace all records in a store in a single clear + put transaction. */
export async function replaceAll<T>(
  storeName: StoreName,
  records: T[],
): Promise<void> {
  const db = await openPalosDB();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  store.clear();
  for (const record of records) {
    store.put(record);
  }
  return transactionDone(transaction);
}

/** Delete matching records, then put replacements in the same transaction. */
export async function replaceWhere<T>(
  storeName: StoreName,
  predicate: (record: T) => boolean,
  replacements: T[],
): Promise<void> {
  const db = await openPalosDB();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  const request = store.openCursor();

  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) {
      if (predicate(cursor.value as T)) {
        cursor.delete();
      }
      cursor.continue();
      return;
    }

    for (const record of replacements) {
      store.put(record);
    }
  };

  return transactionDone(transaction);
}

/** Replace multiple stores in one transaction. Used by migration and async import flush. */
export async function replaceStores(batch: StoreBatch): Promise<void> {
  const entries = Object.entries(batch) as Array<[StoreName, unknown[]]>;
  if (entries.length === 0) return;
  const db = await openPalosDB();
  const transaction = db.transaction(
    entries.map(([storeName]) => storeName),
    "readwrite",
  );

  for (const [storeName, records] of entries) {
    const store = transaction.objectStore(storeName);
    store.clear();
    for (const record of records) {
      store.put(record);
    }
  }

  return transactionDone(transaction);
}

/** Clear all records from a store. */
export async function clearStore(storeName: StoreName): Promise<void> {
  const db = await openPalosDB();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).clear();
  return transactionDone(transaction);
}

/** Count records in a store. */
export async function countStore(storeName: StoreName): Promise<number> {
  const db = await openPalosDB();
  return new Promise<number>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
