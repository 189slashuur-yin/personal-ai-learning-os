import type { Conversation } from "@/core/entities/conversation";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Message } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";
import type { Round } from "@/core/entities/round";
import {
  readAll,
  replaceStores,
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

export class AppDataStorage {
  private readonly legacy = new BrowserAppDataStorage();

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
  }> {
    const importedLocalStorageKeys = this.legacy.importData(bundle, selectedKeys);
    const batch = selectedIndexedDBBatch(bundle);
    const stores = Object.keys(batch);
    const indexedDBRecords = Object.values(batch).reduce(
      (sum, records) => sum + (records?.length ?? 0),
      0,
    );

    if (stores.length > 0) {
      await replaceStores(batch);
      clearCaches();
      await preloadAll();
    }

    return {
      importedLocalStorageKeys,
      importedIndexedDBStores: stores.length,
      indexedDBRecords,
    };
  }
}
