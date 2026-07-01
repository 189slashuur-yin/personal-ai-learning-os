import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";

const KNOWLEDGE_CARDS_KEY = "ai-learning-os.knowledge-cards";

export class BrowserKnowledgeCardStorage implements KnowledgeCardStorage {
  save(card: KnowledgeCard) {
    const cards = this.getAll();

    if (cards.some((storedCard) => storedCard.proposalId === card.proposalId)) {
      return;
    }

    window.localStorage.setItem(
      KNOWLEDGE_CARDS_KEY,
      JSON.stringify([...cards, card]),
    );
  }

  getFirst() {
    return this.getAll()[0] ?? null;
  }

  getByProposalId(proposalId: string) {
    return this.getAll().find((card) => card.proposalId === proposalId) ?? null;
  }

  getAll() {
    const storedCards = window.localStorage.getItem(KNOWLEDGE_CARDS_KEY);

    if (!storedCards) {
      return [];
    }

    return JSON.parse(storedCards) as KnowledgeCard[];
  }
}
