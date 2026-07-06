import type { RoundStorage } from "@/core/contracts/round-storage";
import type { Round } from "@/core/entities/round";

export class InMemoryRoundStorage implements RoundStorage {
  private store = new Map<string, Round>();

  save(round: Round): void {
    this.store.set(round.id, { ...round });
  }

  saveMany(rounds: Round[]): void {
    for (const round of rounds) {
      this.store.set(round.id, { ...round });
    }
  }

  getAll(): Round[] {
    return [...this.store.values()];
  }

  getById(id: string): Round | null {
    return this.store.get(id) ?? null;
  }

  getByConversationId(conversationId: string): Round[] {
    return [...this.store.values()]
      .filter((r) => r.conversationId === conversationId)
      .sort((a, b) => a.order - b.order);
  }

  remove(id: string): void {
    this.store.delete(id);
  }

  removeByConversationId(conversationId: string): void {
    for (const [id, round] of this.store) {
      if (round.conversationId === conversationId) {
        this.store.delete(id);
      }
    }
  }

  replaceByConversationId(conversationId: string, rounds: Round[]): void {
    this.removeByConversationId(conversationId);
    this.saveMany(rounds);
  }

  clear(): void {
    this.store.clear();
  }
}
