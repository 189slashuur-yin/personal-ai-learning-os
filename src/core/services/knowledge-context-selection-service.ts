import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { KnowledgeContextMutationWriter } from "@/core/contracts/knowledge-context-mutation-writer";
import type { KnowledgeContextRef } from "@/core/entities/knowledge-context-ref";
import {
  resolveKnowledgeAddOrRefresh, replaceKnowledgeRef, selection,
  validateKnowledgeRefs, type KnowledgeResolution,
} from "./knowledge-context-service";

/** Selection commands use the refs visible to the user as the expected baseline. */
export class KnowledgeContextSelectionService {
  constructor(
    private readonly cards: KnowledgeCardStorage,
    private readonly writer: KnowledgeContextMutationWriter,
  ) {}

  listCards() { return this.cards.getAll(); }

  preview(cardId: string, refs: KnowledgeContextRef[], mode: "add" | "refresh"): KnowledgeResolution {
    return resolveKnowledgeAddOrRefresh(this.cards.getById(cardId), refs, mode);
  }

  async addOrRefresh(
    conversationId: string, cardId: string, expectedRefs: KnowledgeContextRef[],
    mode: "add" | "refresh", confirmedTruncation: boolean,
  ) {
    const resolved = resolveKnowledgeAddOrRefresh(
      this.cards.getById(cardId), expectedRefs, mode, confirmedTruncation,
    );
    if (resolved.status !== "ok" && resolved.status !== "archived-warning") return resolved;
    const nextRefs = replaceKnowledgeRef(expectedRefs, resolved.ref);
    const receipt = await this.writer.execute({ conversationId, expectedRefs, nextRefs });
    return { status: resolved.status, refs: receipt.knowledgeContextRefs } as const;
  }

  async remove(conversationId: string, expectedRefs: KnowledgeContextRef[], cardId: string) {
    const nextRefs = selection(expectedRefs).filter((ref) => ref.knowledgeCardId !== cardId)
      .map((ref, order) => ({ ...ref, order }));
    if (nextRefs.length === expectedRefs.length) throw new Error("Selection changed; reload and retry.");
    if (!validateKnowledgeRefs(nextRefs)) throw new Error("Invalid Knowledge selection.");
    return this.writer.execute({ conversationId, expectedRefs, nextRefs });
  }

  async move(conversationId: string, expectedRefs: KnowledgeContextRef[], cardId: string, offset: -1 | 1) {
    const index = expectedRefs.findIndex((ref) => ref.knowledgeCardId === cardId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= expectedRefs.length) throw new Error("Selection changed; reload and retry.");
    const nextRefs = [...expectedRefs];
    [nextRefs[index], nextRefs[target]] = [nextRefs[target], nextRefs[index]];
    const ordered = nextRefs.map((ref, order) => ({ ...ref, order }));
    return this.writer.execute({ conversationId, expectedRefs, nextRefs: ordered });
  }
}
