import type { Conversation } from "@/core/entities/conversation";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Proposal } from "@/core/entities/proposal";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import { drainPendingWrites, readAll, replaceStores, type StoreBatch } from "./database";

// ---- Module-level in-memory caches ----
// These are populated by preloadAll() and used synchronously by
// the IndexedDB storage implementations. All writes flush through
// to both the cache and IndexedDB.

let _conversations: Conversation[] = [];
let _messages: Message[] = [];
let _rounds: Round[] = [];
let _sources: ImportedSource[] = [];
let _proposals: Proposal[] = [];
let _knowledgeCards: KnowledgeCard[] = [];
let _conversationVersions: ConversationVersion[] = [];

let _loaded = false;
let _preloadPromise: Promise<PreloadCounts> | null = null;

// ---- Getters / Setters for caches ----

export function getConversationCache(): Conversation[] {
  return _conversations;
}
export function setConversationCache(v: Conversation[]): void {
  _conversations = v;
}

export function getMessageCache(): Message[] {
  return _messages;
}
export function setMessageCache(v: Message[]): void {
  _messages = v;
}

export function getRoundCache(): Round[] {
  return _rounds;
}
export function setRoundCache(v: Round[]): void {
  _rounds = v;
}

export function getSourceCache(): ImportedSource[] {
  return _sources;
}
export function setSourceCache(v: ImportedSource[]): void {
  _sources = v;
}

export function getProposalCache(): Proposal[] {
  return _proposals;
}
export function setProposalCache(v: Proposal[]): void {
  _proposals = v;
}

export function getKnowledgeCardCache(): KnowledgeCard[] {
  return _knowledgeCards;
}
export function setKnowledgeCardCache(v: KnowledgeCard[]): void {
  _knowledgeCards = v;
}

export function getConversationVersionCache(): ConversationVersion[] {
  return _conversationVersions;
}
export function setConversationVersionCache(v: ConversationVersion[]): void {
  _conversationVersions = v;
}

export function isIndexedDBLoaded(): boolean {
  return _loaded;
}

export interface PreloadCounts {
  conversations: number;
  messages: number;
  rounds: number;
  sources: number;
  proposals: number;
  knowledgeCards: number;
  conversationVersions: number;
}

/** Preload all entity data from IndexedDB into the in-memory caches. */
export async function preloadAll(): Promise<PreloadCounts> {
  if (_preloadPromise) return _preloadPromise;

  _preloadPromise = loadAll();
  try {
    return await _preloadPromise;
  } finally {
    _preloadPromise = null;
  }
}

async function loadAll(): Promise<PreloadCounts> {
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

  _conversations = conversations;
  _messages = messages;
  _rounds = rounds;
  _sources = sources;
  _proposals = proposals;
  _knowledgeCards = knowledgeCards;
  _conversationVersions = conversationVersions;
  _loaded = true;

  return {
    conversations: conversations.length,
    messages: messages.length,
    rounds: rounds.length,
    sources: sources.length,
    proposals: proposals.length,
    knowledgeCards: knowledgeCards.length,
    conversationVersions: conversationVersions.length,
  };
}

export function getCachedCounts(): PreloadCounts {
  return {
    conversations: _conversations.length,
    messages: _messages.length,
    rounds: _rounds.length,
    sources: _sources.length,
    proposals: _proposals.length,
    knowledgeCards: _knowledgeCards.length,
    conversationVersions: _conversationVersions.length,
  };
}

export function buildCacheBatch(): StoreBatch {
  return {
    conversations: _conversations,
    messages: _messages,
    rounds: _rounds,
    sources: _sources,
    proposals: _proposals,
    "knowledge-cards": _knowledgeCards,
    "conversation-versions": _conversationVersions,
  };
}

export async function flushCachesToIndexedDB(): Promise<void> {
  try {
    // Drain all pending background writes (persistInBackground) before the
    // authoritative replaceStores.  This prevents a late-arriving writeOne
    // (e.g. from a previous import save()) from re-adding data that
    // replaceStores has just cleared from IndexedDB stores.
    await drainPendingWrites();
    await replaceStores(buildCacheBatch());
  } catch (err) {
    console.error("flushCachesToIndexedDB failed:", err);
    throw err;
  }
}

/** Clear all in-memory caches (does NOT touch IndexedDB). */
export function clearCaches(): void {
  _conversations = [];
  _messages = [];
  _rounds = [];
  _sources = [];
  _proposals = [];
  _knowledgeCards = [];
  _conversationVersions = [];
  _loaded = false;
  _preloadPromise = null;
}
