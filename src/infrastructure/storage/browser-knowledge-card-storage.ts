import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";

const KNOWLEDGE_CARDS_KEY = "ai-learning-os.knowledge-cards";

export class BrowserKnowledgeCardStorage implements KnowledgeCardStorage {
  save(card: KnowledgeCard): void {
    const cards = this.getAll();

    if (cards.some((storedCard) => storedCard.proposalId === card.proposalId)) {
      return;
    }

    window.localStorage.setItem(
      KNOWLEDGE_CARDS_KEY,
      JSON.stringify([...cards, card]),
    );
  }

  update(card: KnowledgeCard): void {
    const cards = this.getAll();
    const cardIndex = cards.findIndex((storedCard) => storedCard.id === card.id);

    if (cardIndex === -1) {
      return;
    }

    cards[cardIndex] = card;
    this.write(cards);
  }

  getFirst(): KnowledgeCard | null {
    return this.getAll()[0] ?? null;
  }

  getById(id: string): KnowledgeCard | null {
    return this.getAll().find((card) => card.id === id) ?? null;
  }

  getByProposalId(proposalId: string): KnowledgeCard | null {
    return this.getAll().find((card) => card.proposalId === proposalId) ?? null;
  }

  getAll(): KnowledgeCard[] {
    const storedCards = window.localStorage.getItem(KNOWLEDGE_CARDS_KEY);

    if (!storedCards) {
      return [];
    }

    const cards = JSON.parse(storedCards) as KnowledgeCard[];

    return cards.map((card) => ({
      ...card,
      summary: card.summary ?? card.content ?? "",
      tagIds: card.tagIds ?? [],
      updatedAt: card.updatedAt ?? card.createdAt,
      status: card.status === "Archived" ? "Archived" : "Active",
    }));
  }

  remove(id: string): void {
    this.write(this.getAll().filter((card) => card.id !== id));
  }

  removeByProposalIds(proposalIds: string[]): void {
    const proposalIdSet = new Set(proposalIds);
    const cards = this.getAll().filter(
      (card) => !proposalIdSet.has(card.proposalId),
    );
    this.write(cards);
  }

  private write(cards: KnowledgeCard[]): void {
    window.localStorage.setItem(KNOWLEDGE_CARDS_KEY, JSON.stringify(cards));
  }
}
