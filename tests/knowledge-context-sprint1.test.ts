import { describe, expect, it } from "vitest";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { KnowledgeContextRef } from "@/core/entities/knowledge-context-ref";
import {
  makeKnowledgeReuseAudit, replaceKnowledgeRef, resolveKnowledgeAddOrRefresh,
  sourceStatus, validateKnowledgeAudit, validateKnowledgeRefs,
} from "@/core/services/knowledge-context-service";

const now = "2026-09-27T00:00:00.000Z";
function card(id: string, content = "content"): KnowledgeCard {
  return { id, proposalId: "p", title: id, content, summary: "", sourceFile: "", tagIds: [],
    createdAt: now, updatedAt: now, status: "Active" };
}
function ref(id: string, order: number, length = 1): KnowledgeContextRef {
  return { knowledgeCardId: id, titleSnapshot: id, contentSnapshot: "a".repeat(length),
    knowledgeUpdatedAtSnapshot: now, order, originalContentLength: length, contentTruncated: false };
}
describe("Sprint 1 Knowledge Context resolver", () => {
  it("accepts old missing fields and an explicitly empty v1.11 selection/audit", () => {
    expect(validateKnowledgeRefs([])).toBe(true);
    expect(validateKnowledgeAudit([])).toBe(true);
  });
  it("accepts one and five refs, rejects duplicate, sixth, and over-budget refs", () => {
    expect(validateKnowledgeRefs([ref("a", 0)])).toBe(true);
    expect(validateKnowledgeRefs(Array.from({ length: 5 }, (_, i) => ref(String(i), i)))).toBe(true);
    expect(validateKnowledgeRefs([ref("a", 0), ref("a", 1)])).toBe(false);
    expect(validateKnowledgeRefs(Array.from({ length: 6 }, (_, i) => ref(String(i), i)))).toBe(false);
    expect(validateKnowledgeRefs(Array.from({ length: 5 }, (_, i) => ref(String(i), i, 4000)))).toBe(false);
  });
  it("requires confirmation only for a newly truncated add or refresh", () => {
    const exact = resolveKnowledgeAddOrRefresh(card("a", "a".repeat(4000)), [], "add");
    expect(exact.status).toBe("ok");
    const preview = resolveKnowledgeAddOrRefresh(card("a", "a".repeat(4001)), [], "add");
    expect(preview.status).toBe("requires-truncation-confirmation");
    const confirmed = resolveKnowledgeAddOrRefresh(card("a", "a".repeat(4001)), [], "add", true);
    expect(confirmed.status).toBe("ok");
    if (confirmed.status === "ok") {
      expect(confirmed.ref.contentSnapshot).toHaveLength(4000);
      expect(confirmed.ref.originalContentLength).toBe(4001);
      expect(confirmed.ref.contentTruncated).toBe(true);
      expect(makeKnowledgeReuseAudit([confirmed.ref])[0].contentSnapshot).toBe(confirmed.ref.contentSnapshot);
    }
  });
  it("blocks total overflow without dropping a ref", () => {
    const four = Array.from({ length: 4 }, (_, i) => ref(String(i), i, 4000));
    expect(validateKnowledgeRefs(four)).toBe(true);
    expect(resolveKnowledgeAddOrRefresh(card("fifth", "x"), four, "add").status).toBe("blocked-over-budget");
  });
  it("keeps frozen content after an edit or deletion and warns on archive", () => {
    const old = ref("a", 0);
    expect(sourceStatus(old, null)).toBe("snapshot-only");
    expect(sourceStatus(old, { ...card("a"), status: "Archived" })).toBe("archived-warning");
    expect(sourceStatus(old, { ...card("a"), updatedAt: "2026-09-28T00:00:00.000Z" })).toBe("updated");
    const updated = { ...card("a", "new"), updatedAt: "2026-09-28T00:00:00.000Z" };
    const resolution = resolveKnowledgeAddOrRefresh(updated, [old], "refresh");
    expect(old.contentSnapshot).toBe("a");
    if (resolution.status === "ok") expect(replaceKnowledgeRef([old], resolution.ref)[0].contentSnapshot).toBe("new");
  });
});
