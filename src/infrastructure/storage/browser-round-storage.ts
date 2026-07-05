import type { RoundStorage } from "@/core/contracts/round-storage";
import type { Round } from "@/core/entities/round";

const ROUNDS_KEY = "ai-learning-os.rounds";

function normalizeRound(round: Round): Round {
  return {
    ...round,
    title: round.title ?? `Round ${round.order}`,
    question: round.question ?? "",
    answer: round.answer ?? "",
    messageIds: Array.isArray(round.messageIds) ? round.messageIds : [],
    note: round.note?.trim() || undefined,
    updatedAt: round.updatedAt ?? round.createdAt,
  };
}

export class BrowserRoundStorage implements RoundStorage {
  save(round: Round) {
    const rounds = this.getAll();
    const existingIndex = rounds.findIndex((stored) => stored.id === round.id);

    if (existingIndex >= 0) {
      rounds[existingIndex] = normalizeRound(round);
    } else {
      rounds.push(normalizeRound(round));
    }

    this.persist(rounds);
  }

  saveMany(rounds: Round[]) {
    const nextRounds = this.getAll();

    rounds.forEach((round) => {
      const existingIndex = nextRounds.findIndex((stored) => stored.id === round.id);

      if (existingIndex >= 0) {
        nextRounds[existingIndex] = normalizeRound(round);
      } else {
        nextRounds.push(normalizeRound(round));
      }
    });

    this.persist(nextRounds);
  }

  getAll() {
    const storedRounds = window.localStorage.getItem(ROUNDS_KEY);

    if (!storedRounds) {
      return [];
    }

    return (JSON.parse(storedRounds) as Round[]).map(normalizeRound);
  }

  getById(id: string) {
    return this.getAll().find((round) => round.id === id) ?? null;
  }

  getByConversationId(conversationId: string) {
    return this.getAll()
      .filter((round) => round.conversationId === conversationId)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }

  remove(id: string) {
    this.persist(this.getAll().filter((round) => round.id !== id));
  }

  removeByConversationId(conversationId: string) {
    this.persist(
      this.getAll().filter((round) => round.conversationId !== conversationId),
    );
  }

  replaceByConversationId(conversationId: string, rounds: Round[]) {
    const otherRounds = this.getAll().filter(
      (round) => round.conversationId !== conversationId,
    );
    const conversationRounds = rounds
      .filter((round) => round.conversationId === conversationId)
      .map(normalizeRound);

    this.persist([...otherRounds, ...conversationRounds]);
  }

  private persist(rounds: Round[]) {
    window.localStorage.setItem(ROUNDS_KEY, JSON.stringify(rounds));
  }
}
