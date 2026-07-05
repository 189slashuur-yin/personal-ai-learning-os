import type { RoundStorage } from "@/core/contracts/round-storage";
import type { Round } from "@/core/entities/round";

export type CreateRoundInput = Pick<
  Round,
  "conversationId" | "question" | "answer" | "messageIds"
> &
  Partial<Pick<Round, "title" | "note" | "order">>;

export type UpdateRoundInput = Partial<
  Pick<Round, "title" | "question" | "answer" | "messageIds" | "note" | "summary">
>;

function normalizeOptional(value?: string) {
  return value?.trim() || undefined;
}

function uniqueMessageIds(messageIds: string[]) {
  return [...new Set(messageIds.filter(Boolean))];
}

function joinText(left: string, right: string) {
  return [left.trim(), right.trim()].filter(Boolean).join("\n\n");
}

function splitText(value: string): [string, string] {
  const paragraphs = value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) {
    const middle = Math.ceil(paragraphs.length / 2);
    return [paragraphs.slice(0, middle).join("\n\n"), paragraphs.slice(middle).join("\n\n")];
  }
  if (!value.trim()) return ["", ""];
  const middle = Math.ceil(value.length / 2);
  const splitAt = value.indexOf("\n", middle);
  const index = splitAt >= 0 ? splitAt : middle;
  return [value.slice(0, index).trim(), value.slice(index).trim()];
}

export class RoundService {
  constructor(private readonly rounds: RoundStorage) {}

  listByConversation(conversationId: string) {
    return this.rounds.getByConversationId(conversationId);
  }

  getRound(id: string) {
    return this.rounds.getById(id);
  }

  createRound(input: CreateRoundInput) {
    const existingRounds = this.listByConversation(input.conversationId);
    const order = input.order ?? existingRounds.length + 1;
    const timestamp = new Date().toISOString();
    const round: Round = {
      id: crypto.randomUUID(),
      conversationId: input.conversationId,
      order,
      title: input.title?.trim() || `Round ${order}`,
      question: input.question.trim(),
      answer: input.answer.trim(),
      messageIds: uniqueMessageIds(input.messageIds),
      note: normalizeOptional(input.note),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.rounds.save(round);
    return round;
  }

  updateRound(id: string, input: UpdateRoundInput) {
    const round = this.rounds.getById(id);

    if (!round) {
      return null;
    }

    const updatedRound: Round = {
      ...round,
      title: input.title === undefined ? round.title : input.title.trim(),
      question:
        input.question === undefined ? round.question : input.question.trim(),
      answer: input.answer === undefined ? round.answer : input.answer.trim(),
      messageIds:
        input.messageIds === undefined
          ? round.messageIds
          : uniqueMessageIds(input.messageIds),
      note: input.note === undefined ? round.note : normalizeOptional(input.note),
      summary:
        input.summary === undefined ? round.summary : normalizeOptional(input.summary),
      updatedAt: new Date().toISOString(),
    };

    this.rounds.save(updatedRound);
    return updatedRound;
  }

  deleteRound(id: string) {
    const round = this.rounds.getById(id);
    if (!round) return false;
    this.rounds.remove(id);
    this.persistOrdered(round.conversationId, new Date().toISOString());
    return true;
  }

  mergeRounds(firstId: string, secondId: string) {
    const first = this.rounds.getById(firstId);
    const second = this.rounds.getById(secondId);
    if (!first || !second || first.conversationId !== second.conversationId) return null;

    const [primary, secondary] = [first, second].sort((left, right) => left.order - right.order);
    const timestamp = new Date().toISOString();
    const merged: Round = {
      ...primary,
      question: joinText(primary.question, secondary.question),
      answer: joinText(primary.answer, secondary.answer),
      messageIds: uniqueMessageIds([...primary.messageIds, ...secondary.messageIds]),
      note: normalizeOptional(joinText(primary.note ?? "", secondary.note ?? "")),
      createdAt:
        primary.createdAt.localeCompare(secondary.createdAt) <= 0
          ? primary.createdAt
          : secondary.createdAt,
      updatedAt: timestamp,
    };

    this.rounds.remove(secondary.id);
    this.rounds.save(merged);
    this.persistOrdered(primary.conversationId, timestamp);
    return this.rounds.getById(merged.id);
  }

  splitRound(id: string) {
    const round = this.rounds.getById(id);
    if (!round || (!round.question && !round.answer && round.messageIds.length === 0)) return null;

    const timestamp = new Date().toISOString();
    const [leftQuestion, rightQuestion] = splitText(round.question);
    const [leftAnswer, rightAnswer] = splitText(round.answer);
    const messageMiddle = Math.ceil(round.messageIds.length / 2);
    const currentRound: Round = {
      ...round,
      question: leftQuestion,
      answer: leftAnswer,
      messageIds: round.messageIds.slice(0, messageMiddle),
      updatedAt: timestamp,
    };
    const newRound: Round = {
      ...round,
      id: crypto.randomUUID(),
      order: round.order + 1,
      title: `${round.title} (split)`,
      question: rightQuestion,
      answer: rightAnswer,
      messageIds: round.messageIds.slice(messageMiddle),
      note: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const siblings = this.listByConversation(round.conversationId).map((sibling) =>
      sibling.id !== round.id && sibling.order > round.order
        ? { ...sibling, order: sibling.order + 1, updatedAt: timestamp }
        : sibling,
    );
    this.rounds.replaceByConversationId(round.conversationId, [
      ...siblings.filter((sibling) => sibling.id !== round.id),
      currentRound,
      newRound,
    ]);
    return newRound;
  }

  reorderRound(id: string, nextOrder: number) {
    const round = this.rounds.getById(id);
    if (!round) return null;
    const siblings = this.listByConversation(round.conversationId);
    const boundedOrder = Math.max(1, Math.min(nextOrder, siblings.length));
    if (boundedOrder === round.order) return round;
    const timestamp = new Date().toISOString();
    const reordered = siblings
      .filter((sibling) => sibling.id !== id)
      .sort((left, right) => left.order - right.order);
    reordered.splice(boundedOrder - 1, 0, round);
    this.rounds.replaceByConversationId(
      round.conversationId,
      reordered.map((sibling, index) => ({
        ...sibling,
        order: index + 1,
        updatedAt: timestamp,
      })),
    );
    return this.rounds.getById(id);
  }

  rebindMessageIds(id: string, messageIds: string[]) {
    const round = this.rounds.getById(id);
    if (!round) return null;
    const nextMessageIds = uniqueMessageIds(messageIds);
    const nextIdSet = new Set(nextMessageIds);
    const timestamp = new Date().toISOString();
    const siblings = this.listByConversation(round.conversationId).map((sibling) => ({
      ...sibling,
      messageIds:
        sibling.id === id
          ? nextMessageIds
          : sibling.messageIds.filter((messageId) => !nextIdSet.has(messageId)),
      updatedAt:
        sibling.id === id || sibling.messageIds.some((messageId) => nextIdSet.has(messageId))
          ? timestamp
          : sibling.updatedAt,
    }));
    this.rounds.replaceByConversationId(round.conversationId, siblings);
    return this.rounds.getById(id);
  }

  private persistOrdered(conversationId: string, timestamp: string) {
    const rounds = this.listByConversation(conversationId).map((round, index) => ({
      ...round,
      order: index + 1,
      updatedAt: round.order === index + 1 ? round.updatedAt : timestamp,
    }));
    this.rounds.replaceByConversationId(conversationId, rounds);
  }
}
