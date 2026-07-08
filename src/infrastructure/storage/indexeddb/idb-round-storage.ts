import type { RoundStorage } from "@/core/contracts/round-storage";
import type { Round } from "@/core/entities/round";
import { getRoundCache, setRoundCache } from "./preload";
import {
  deleteOne,
  deleteWhere,
  persistInBackground,
  replaceWhere,
  writeMany,
  writeOne,
} from "./database";

function normalizeRound(round: Round): Round {
  return {
    ...round,
    title: round.title ?? `Round ${round.order}`,
    question: round.question ?? "",
    answer: round.answer ?? "",
    messageIds: Array.isArray(round.messageIds) ? round.messageIds : [],
    note: round.note?.trim() || undefined,
    summary: round.summary?.trim() || undefined,
    updatedAt: round.updatedAt ?? round.createdAt,
  };
}

export class IndexedDBRoundStorage implements RoundStorage {
  save(round: Round): void {
    const norm = normalizeRound(round);
    const cache = getRoundCache();
    const idx = cache.findIndex((r) => r.id === norm.id);
    if (idx >= 0) cache[idx] = norm;
    else cache.push(norm);
    persistInBackground("save round", writeOne("rounds", norm));
  }

  saveMany(rounds: Round[]): void {
    const cache = getRoundCache();
    for (const round of rounds) {
      const norm = normalizeRound(round);
      const idx = cache.findIndex((r) => r.id === norm.id);
      if (idx >= 0) cache[idx] = norm;
      else cache.push(norm);
    }
    persistInBackground(
      "save many rounds",
      writeMany("rounds", rounds.map(normalizeRound)),
    );
  }

  getAll(): Round[] {
    return getRoundCache().map(normalizeRound);
  }

  getById(id: string): Round | null {
    return this.getAll().find((r) => r.id === id) ?? null;
  }

  getByConversationId(conversationId: string): Round[] {
    return this.getAll()
      .filter((r) => r.conversationId === conversationId)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }

  remove(id: string): void {
    setRoundCache(getRoundCache().filter((r) => r.id !== id));
    persistInBackground("remove round", deleteOne("rounds", id));
  }

  removeByConversationId(conversationId: string): void {
    setRoundCache(getRoundCache().filter((r) => r.conversationId !== conversationId));
    persistInBackground(
      "remove rounds by conversation",
      deleteWhere<Round>(
        "rounds",
        (round) => round.conversationId === conversationId,
      ),
    );
  }

  replaceByConversationId(conversationId: string, rounds: Round[]): void {
    const other = getRoundCache().filter((r) => r.conversationId !== conversationId);
    const convRounds = rounds
      .filter((r) => r.conversationId === conversationId)
      .map(normalizeRound);
    const all = [...other, ...convRounds];
    setRoundCache(all);
    persistInBackground(
      "replace rounds by conversation",
      replaceWhere<Round>(
        "rounds",
        (round) => round.conversationId === conversationId,
        convRounds,
      ),
    );
  }
}
