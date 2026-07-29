import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";
import type { SourceStorage } from "@/core/contracts/source-storage";
import type { ProposalStorage } from "@/core/contracts/proposal-storage";
import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import { BrowserConversationStorage } from "./browser-conversation-storage";
import { BrowserMessageStorage } from "./browser-message-storage";
import { BrowserRoundStorage } from "./browser-round-storage";
import { BrowserSourceStorage } from "./browser-source-storage";
import { BrowserProposalStorage } from "./browser-proposal-storage";
import { BrowserKnowledgeCardStorage } from "./browser-knowledge-card-storage";
import { BrowserConversationVersionStorage } from "./browser-conversation-version-storage";
import {
  IndexedDBConversationStorage,
  IndexedDBMessageStorage,
  IndexedDBRoundStorage,
  IndexedDBSourceStorage,
  IndexedDBProposalStorage,
  IndexedDBKnowledgeCardStorage,
  IndexedDBConversationVersionStorage,
  preloadAll,
  isIndexedDBLoaded,
  getCachedCounts,
  clearCaches,
} from "./indexeddb";
import type { PreloadCounts } from "./indexeddb";

export type StorageMode = "localStorage" | "indexedDB";

const STORAGE_MODE_KEY = "palos.storage-mode";
const DEFAULT_STORAGE_MODE: StorageMode = "indexedDB";

export function getStorageMode(): StorageMode {
  if (typeof window === "undefined") return DEFAULT_STORAGE_MODE;
  try {
    const mode = window.localStorage.getItem(STORAGE_MODE_KEY);
    if (mode === "indexedDB") return "indexedDB";
    if (mode === "localStorage") return "localStorage";
    return DEFAULT_STORAGE_MODE;
  } catch {
    return DEFAULT_STORAGE_MODE;
  }
}

export function setStorageMode(mode: StorageMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_MODE_KEY, mode);
    if (mode === "localStorage") {
      clearCaches();
    }
  } catch {
    // non-critical
  }
}

/** Ensure IndexedDB data is loaded into memory. Safe to call multiple times. */
export async function ensureIndexedDBLoaded(): Promise<PreloadCounts> {
  if (isIndexedDBLoaded()) {
    return getCachedCounts();
  }
  return preloadAll();
}

// ---- Storage Factory ----

export interface StorageInstances {
  conversations: ConversationStorage;
  messages: MessageStorage;
  rounds: RoundStorage;
  sources: SourceStorage;
  proposals: ProposalStorage;
  knowledgeCards: KnowledgeCardStorage;
  conversationVersions: ConversationVersionStorage;
}

export function createStorageInstances(mode?: StorageMode): StorageInstances {
  const effectiveMode = mode ?? getStorageMode();

  if (effectiveMode === "indexedDB") {
    return {
      conversations: new IndexedDBConversationStorage(),
      messages: new IndexedDBMessageStorage(),
      rounds: new IndexedDBRoundStorage(),
      sources: new IndexedDBSourceStorage(),
      proposals: new IndexedDBProposalStorage(),
      knowledgeCards: new IndexedDBKnowledgeCardStorage(),
      conversationVersions: new IndexedDBConversationVersionStorage(),
    };
  }

  return {
    conversations: new BrowserConversationStorage(),
    messages: new BrowserMessageStorage(),
    rounds: new BrowserRoundStorage(),
    sources: new BrowserSourceStorage(),
    proposals: new BrowserProposalStorage(),
    knowledgeCards: new BrowserKnowledgeCardStorage(),
    conversationVersions: new BrowserConversationVersionStorage(),
  };
}

// ---- Individual factory functions for convenience ----

export function createConversationStorage(): ConversationStorage {
  return getStorageMode() === "indexedDB"
    ? new IndexedDBConversationStorage()
    : new BrowserConversationStorage();
}

export function createMessageStorage(): MessageStorage {
  return getStorageMode() === "indexedDB"
    ? new IndexedDBMessageStorage()
    : new BrowserMessageStorage();
}

export function createRoundStorage(): RoundStorage {
  return getStorageMode() === "indexedDB"
    ? new IndexedDBRoundStorage()
    : new BrowserRoundStorage();
}

export function createSourceStorage(): SourceStorage {
  return getStorageMode() === "indexedDB"
    ? new IndexedDBSourceStorage()
    : new BrowserSourceStorage();
}

export function createProposalStorage(): ProposalStorage {
  return getStorageMode() === "indexedDB"
    ? new IndexedDBProposalStorage()
    : new BrowserProposalStorage();
}

export function createKnowledgeCardStorage(): KnowledgeCardStorage {
  return getStorageMode() === "indexedDB"
    ? new IndexedDBKnowledgeCardStorage()
    : new BrowserKnowledgeCardStorage();
}

export function createConversationVersionStorage(): ConversationVersionStorage {
  return getStorageMode() === "indexedDB"
    ? new IndexedDBConversationVersionStorage()
    : new BrowserConversationVersionStorage();
}
