import { describe, expect, it, vi } from "vitest";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";
import { manualKnowledgeContent, verifyManualKnowledge } from "@/app/conversation/[id]/manual-knowledge-persistence";

const proposal: Proposal = { id: "p1", conversationId: "c1", title: "P", summary: "content", sourceEvidence: { sourceName: "", excerpt: "" }, generatedBy: "Demo Analyzer Generated", status: "Applied", createdAt: "now" };
const card: KnowledgeCard = { id: "k1", proposalId: "p1", sourceConversationId: "c1", title: "K", content: "content", summary: "content", sourceFile: "", tagIds: [], status: "Active", createdAt: "now", updatedAt: "now" };

describe("verifyManualKnowledge", () => {
  it("rejects an empty manual preview before any persistence orchestration", () => {
    expect(manualKnowledgeContent("  \n ")).toBeNull();
    expect(manualKnowledgeContent(" kept ")).toBe("kept");
  });
  it("reports success and refreshes only after authoritative verification", async () => {
    const order: string[] = [];
    const deps = { mode: () => "indexedDB" as const, put: vi.fn(async () => { order.push("put"); }), readCards: vi.fn(async () => { order.push("read"); return [card]; }), notify: vi.fn(() => { order.push("notify"); }) };
    await expect(verifyManualKnowledge(card, proposal, deps)).resolves.toBe(card);
    expect(order).toEqual(["put", "read", "notify"]);
    expect(deps.notify).toHaveBeenCalledWith("c1");
  });

  it("does not report success when the durable write fails and remains retryable", async () => {
    let fail = true;
    const durable = new Map<string, KnowledgeCard>();
    const notify = vi.fn();
    const deps = { mode: () => "indexedDB" as const, put: vi.fn(async (value: KnowledgeCard) => { if (fail) throw new Error("write failed"); durable.set(value.id, value); }), readCards: vi.fn(async () => [...durable.values()]), notify };
    await expect(verifyManualKnowledge(card, proposal, deps)).rejects.toThrow("write failed");
    expect(notify).not.toHaveBeenCalled();
    fail = false;
    await expect(verifyManualKnowledge(card, proposal, deps)).resolves.toBe(card);
    expect(durable).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("never compensates a committed-but-unverified card and retry is idempotent", async () => {
    const durable = new Map([[card.id, card]]);
    let readable = false;
    const notify = vi.fn();
    const deps = { mode: () => "indexedDB" as const, put: vi.fn(async (value: KnowledgeCard) => { durable.set(value.id, value); }), readCards: vi.fn(async () => readable ? [...durable.values()] : []), notify };
    await expect(verifyManualKnowledge(card, proposal, deps)).rejects.toThrow("durable verification failed");
    expect(durable).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
    readable = true;
    await expect(verifyManualKnowledge(card, proposal, deps)).resolves.toBe(card);
    expect(durable).toHaveLength(1);
    expect(deps.put).toHaveBeenCalledTimes(2);
  });
});
