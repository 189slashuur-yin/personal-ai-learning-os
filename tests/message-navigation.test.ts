import { describe, expect, it } from "vitest";
import { messageDeepLink, messageDomId, resolveMessageTarget } from "@/core/services/message-navigation";
import { SearchIndexService } from "@/core/services/search-index-service";
import type { Message } from "@/core/entities/message";

const message: Message = { id: "m", conversationId: "c", role: "assistant", content: "needle", order: 0, createdAt: "", updatedAt: "" };

describe("shared Message navigation", () => {
  it("has one URL contract with encoded parameters and a stable DOM id", () => {
    expect(messageDeepLink("c", "m")).toBe("/conversation/c?message=m#message-m");
    const url = new URL(messageDeepLink("c /?", "m &?#中文"), "http://localhost");
    expect(url.searchParams.get("message")).toBe("m &?#中文");
    expect(decodeURIComponent(url.hash.slice(1))).toBe(messageDomId("m &?#中文"));
  });
  it("rejects missing, duplicate and foreign Message IDs without mutating data", () => {
    const messages = Object.freeze([Object.freeze(message)]);
    expect(resolveMessageTarget("c", "m", messages)).toBe(message);
    expect(resolveMessageTarget("c", null, messages)).toBeNull();
    expect(resolveMessageTarget("c", "missing", messages)).toBeNull();
    expect(resolveMessageTarget("elsewhere", "m", messages)).toBeNull();
    expect(resolveMessageTarget("c", "m", [message, message])).toBeNull();
  });
  it("uses the shared URL for Raw Message search and preserves other hrefs", () => {
    const documents = new SearchIndexService({
      workspaces: [], conversations: [], sources: [], messages: [message],
      rounds: [{ id: "r", conversationId: "c", order: 1, title: "R", question: "", answer: "", messageIds: ["m"], createdAt: "", updatedAt: "" }],
      proposals: [{ id: "p", title: "P", summary: "", sourceEvidence: { sourceName: "", excerpt: "" }, generatedBy: "Demo Analyzer Generated", status: "Pending", createdAt: "" }],
      knowledgeCards: [{ id: "k", proposalId: "p", title: "K", summary: "", content: "", sourceFile: "", tagIds: [], status: "Active", createdAt: "", updatedAt: "" }],
      tasks: [], tags: [], assets: [],
    }).buildDocuments();
    expect(documents.find((d) => d.entityType === "message")?.href).toBe(messageDeepLink("c", "m"));
    expect(documents.find((d) => d.entityType === "round")?.href).toBe("/conversation/c?mode=workspace&round=r#round-r");
    expect(documents.find((d) => d.entityType === "proposal")?.href).toBe("/review?proposal=p");
    expect(documents.find((d) => d.entityType === "knowledge")?.href).toBe("/knowledge/k");
  });
});
