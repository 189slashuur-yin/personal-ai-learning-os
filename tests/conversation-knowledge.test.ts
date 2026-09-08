import { describe, expect, it } from "vitest";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";
import { listConversationKnowledge } from "@/core/services/conversation-knowledge";

const card = (id: string, proposalId: string, sourceConversationId?: string, status: "Active" | "Archived" = "Active"): KnowledgeCard => ({
  id, proposalId, sourceConversationId, title: id, content: id, summary: id, sourceFile: "source",
  tagIds: [], status, createdAt: id === "new" ? "2026-02-01" : "2026-01-01", updatedAt: "2026-02-01",
});
const proposal = (id: string, conversationId?: string): Proposal => ({
  id, conversationId, title: id, summary: id, sourceEvidence: { sourceName: "", excerpt: "" },
  generatedBy: "Demo Analyzer Generated", status: "Applied", createdAt: "2026-01-01",
});

describe("listConversationKnowledge", () => {
  it("combines direct and legacy links, includes archived cards, deduplicates, and sorts stably", () => {
    const direct = card("new", "deleted", "c1", "Archived");
    const legacy = card("old", "p1");
    expect(listConversationKnowledge("c1", [legacy, direct, direct, card("foreign", "p2", "c2")], [proposal("p1", "c1"), proposal("p2", "c2")]))
      .toEqual([direct, legacy]);
  });

  it("fails closed for ambiguous duplicate proposal ownership", () => {
    expect(listConversationKnowledge("c1", [card("old", "p1")], [proposal("p1", "c1"), proposal("p1", "c2")])).toEqual([]);
  });
});
