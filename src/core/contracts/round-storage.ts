import type { Round } from "@/core/entities/round";

export interface RoundStorage {
  save(round: Round): void;
  saveMany(rounds: Round[]): void;
  getAll(): Round[];
  getById(id: string): Round | null;
  getByConversationId(conversationId: string): Round[];
  remove(id: string): void;
  removeByConversationId(conversationId: string): void;
  replaceByConversationId(conversationId: string, rounds: Round[]): void;
}
