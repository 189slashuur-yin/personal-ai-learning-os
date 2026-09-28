import { describe, expect, it } from "vitest";
import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { KnowledgeContextMutationWriter } from "@/core/contracts/knowledge-context-mutation-writer";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { KnowledgeContextRef } from "@/core/entities/knowledge-context-ref";
import { KnowledgeContextSelectionService } from "@/core/services/knowledge-context-selection-service";
import { createContinueContextText, type PalosContextExport } from "@/core/services/context-export-service";
import { duplicateConversationWorkspace } from "@/core/services/conversation-workspace";
import { ConversationMergeService } from "@/core/services/conversation-merge-service";
import { InMemoryConversationStorage, InMemoryMessageStorage, InMemoryRoundStorage, InMemorySourceStorage } from "./fakes";

const now = "2026-09-27T00:00:00.000Z";
function card(id: string, content: string): KnowledgeCard {
  return { id, proposalId: `proposal-${id}`, title: id, content, summary: "", sourceFile: "",
    tagIds: [], createdAt: now, updatedAt: now, status: "Active" };
}
function fixture() {
  const cards = new Map<string, KnowledgeCard>();
  let durable: KnowledgeContextRef[] = [];
  const storage = {
    getAll: () => [...cards.values()], getById: (id: string) => cards.get(id) ?? null,
  } as KnowledgeCardStorage;
  const writer: KnowledgeContextMutationWriter = { execute: async (command) => {
    if (JSON.stringify(command.expectedRefs) !== JSON.stringify(durable)) throw new Error("stale");
    durable = structuredClone(command.nextRefs);
    return { conversationId: command.conversationId, knowledgeContextRefs: structuredClone(durable), verified: true };
  } };
  return { cards, service: new KnowledgeContextSelectionService(storage, writer), durable: () => durable };
}
function exported(refs?: KnowledgeContextRef[]): PalosContextExport {
  return { format: "palos-context-export", version: "1.0", exportedAt: now,
    conversation: { id: "c", title: "Topic", sourceType: "Manual", createdAt: now,
      updatedAt: now, lastOpenedAt: now, knowledgeContextRefs: refs },
    context: {}, decisions: { history: [] }, tasks: [], rounds: [] };
}

describe("Sprint 2 referenced Knowledge commands and Continue Topic", () => {
  it("does not inherit Knowledge refs when duplicating a Conversation", async () => {
    const conversations = new InMemoryConversationStorage();
    const source = exported([{ knowledgeCardId: "external", titleSnapshot: "External",
      contentSnapshot: "Frozen", knowledgeUpdatedAtSnapshot: now, order: 0,
      originalContentLength: 6, contentTruncated: false }]).conversation;
    conversations.save(source);
    const duplicated = await duplicateConversationWorkspace("c", {
      conversations, messages: new InMemoryMessageStorage(), sources: new InMemorySourceStorage(),
      proposals: { getAll: () => [] } as never,
      knowledgeCards: { getAll: () => [] } as never,
    });
    expect(duplicated?.knowledgeContextRefs).toBeUndefined();
    expect(conversations.getById("c")?.knowledgeContextRefs).toHaveLength(1);
  });

  it("keeps only the target selection when merging transcripts", async () => {
    const conversations = new InMemoryConversationStorage();
    const sourceRef: KnowledgeContextRef = { knowledgeCardId: "source-card", titleSnapshot: "Source",
      contentSnapshot: "Source text", knowledgeUpdatedAtSnapshot: now, order: 0,
      originalContentLength: 11, contentTruncated: false };
    const targetRef: KnowledgeContextRef = { ...sourceRef, knowledgeCardId: "target-card",
      titleSnapshot: "Target", contentSnapshot: "Target text" };
    conversations.save({ ...exported([sourceRef]).conversation, id: "source" });
    conversations.save({ ...exported([targetRef]).conversation, id: "target" });
    const versions: unknown[] = [];
    const service = new ConversationMergeService({
      conversations, messages: new InMemoryMessageStorage(), rounds: new InMemoryRoundStorage(),
      sources: new InMemorySourceStorage(),
      versions: { getByConversationId: () => [], save: (version: unknown) => versions.push(version) } as never,
    });
    await service.confirm(service.preview("source", "target"));
    expect(conversations.getById("target")?.knowledgeContextRefs).toEqual([targetRef]);
    expect(conversations.getById("source")?.knowledgeContextRefs).toEqual([sourceRef]);
    expect(versions).toHaveLength(1);
  });
  it("adds five ordered refs, blocks duplicate and sixth, then reorders and removes durably", async () => {
    const { cards, service, durable } = fixture();
    for (let i = 0; i < 6; i++) cards.set(String(i), card(String(i), "content"));
    for (let i = 0; i < 5; i++) {
      const result = await service.addOrRefresh("c", String(i), durable(), "add", false);
      expect(result.status).toBe("ok");
    }
    expect(durable()).toHaveLength(5);
    expect(service.preview("0", durable(), "add").status).toBe("duplicate");
    expect(service.preview("5", durable(), "add").status).toBe("too-many");
    await service.move("c", durable(), "4", -1);
    expect(durable().map((ref) => ref.knowledgeCardId)).toEqual(["0", "1", "2", "4", "3"]);
    await service.remove("c", durable(), "1");
    expect(durable().map((ref) => [ref.knowledgeCardId, ref.order])).toEqual([["0", 0], ["2", 1], ["4", 2], ["3", 3]]);
  });

  it("requires truncation confirmation, keeps frozen content until explicit refresh, and blocks overflow", async () => {
    const { cards, service, durable } = fixture();
    cards.set("a", card("a", "old"));
    await service.addOrRefresh("c", "a", [], "add", false);
    cards.set("a", { ...card("a", "x".repeat(4001)), updatedAt: "2026-09-28T00:00:00.000Z" });
    expect(durable()[0].contentSnapshot).toBe("old");
    expect(service.preview("a", durable(), "refresh").status).toBe("requires-truncation-confirmation");
    expect(durable()[0].contentSnapshot).toBe("old");
    await service.addOrRefresh("c", "a", durable(), "refresh", true);
    expect(durable()[0].contentSnapshot).toHaveLength(4000);
    expect(durable()[0].contentTruncated).toBe(true);
    for (const id of ["b", "c", "d"]) {
      cards.set(id, card(id, "y".repeat(4000)));
      await service.addOrRefresh("c", id, durable(), "add", false);
    }
    cards.set("e", card("e", "z"));
    expect(service.preview("e", durable(), "add").status).toBe("blocked-over-budget");
    expect(durable()).toHaveLength(4);
  });

  it("keeps the exact legacy Continue Topic text with zero refs", () => {
    expect(createContinueContextText(exported())).toBe([
      "# 继续这个主题：Topic", "", "> 以下内容由 PALOS 根据人工维护的数据生成，不包含 AI 推断。", "",
      "## Conversation Context", "- 长期目标 / 背景：（未记录）", "- 当前状态：（未记录）",
      "- 已确认决策：（未记录）", "- 约束条件：（未记录）", "- 下一步方向：（未记录）", "",
      "## 最近 Rounds", "（暂无 Round）", "", "## Pending Questions / 未解决问题", "（未记录）", "",
      "## Next Actions / 下一步行动", "- Context：（未记录）", "- （暂无关联 Task）",
    ].join("\n"));
  });

  it("uses ordered frozen snapshots in Continue Topic even after source deletion", async () => {
    const { cards, service, durable } = fixture();
    cards.set("a", card("a", "A frozen")); cards.set("b", card("b", "B frozen"));
    await service.addOrRefresh("c", "a", [], "add", false);
    await service.addOrRefresh("c", "b", durable(), "add", false);
    cards.delete("a"); cards.set("b", card("b", "B changed"));
    await service.move("c", durable(), "b", -1);
    const text = createContinueContextText(exported(durable()));
    expect(text.indexOf("B frozen")).toBeLessThan(text.indexOf("A frozen"));
    expect(text).not.toContain("B changed");
    expect(text).toContain("A frozen");
  });
});
