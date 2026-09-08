import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";
import { putStores, readAll } from "@/infrastructure/storage/indexeddb/database";
import { getStorageMode } from "@/infrastructure/storage/storage-factory";

type ManualKnowledgePersistence = {
  mode: () => "localStorage" | "indexedDB";
  put: (card: KnowledgeCard, proposal: Proposal) => Promise<void>;
  readCards: () => Promise<KnowledgeCard[]>;
  notify: (conversationId?: string) => void;
};

const defaultPersistence: ManualKnowledgePersistence = {
  mode: getStorageMode,
  put: (card, proposal) => putStores({ proposals: [proposal], "knowledge-cards": [card] }),
  readCards: () => readAll<KnowledgeCard>("knowledge-cards"),
  notify: (conversationId) => window.dispatchEvent(new CustomEvent("palos:knowledge-created", { detail: { conversationId } })),
};

export function manualKnowledgeContent(value?: string) {
  const content = value?.trim() ?? "";
  return content || null;
}

export async function verifyManualKnowledge(
  card: KnowledgeCard,
  proposal: Proposal,
  persistence: ManualKnowledgePersistence = defaultPersistence,
) {
  if (persistence.mode() === "indexedDB") {
    await persistence.put(card, proposal);
    const cards = await persistence.readCards();
    const persisted = cards.find((candidate) => candidate.id === card.id);
    if (!persisted || persisted.proposalId !== proposal.id) {
      throw new Error("Knowledge durable verification failed.");
    }
  }
  persistence.notify(card.sourceConversationId);
  return card;
}
