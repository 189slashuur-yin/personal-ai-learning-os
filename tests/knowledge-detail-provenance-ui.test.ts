import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detailSource = readFileSync(
  new URL("../src/app/knowledge/[id]/knowledge-detail.tsx", import.meta.url),
  "utf8",
);
const conversationDetailSource = readFileSync(
  new URL("../src/app/conversation/[id]/conversation-detail.tsx", import.meta.url),
  "utf8",
);

describe("Knowledge Detail provenance UI", () => {
  it("always renders separate saved-evidence and current-location sections", () => {
    expect(detailSource).toContain('data-testid="knowledge-provenance"');
    expect(detailSource).toContain('data-testid="knowledge-saved-evidence"');
    expect(detailSource).toContain('data-testid="knowledge-current-source"');
    expect(detailSource).toContain("保存时证据");
    expect(detailSource).toContain("当前可定位来源");
    expect(detailSource).toContain("未保存消息级来源");
    expect(detailSource).toContain("Legacy：未保存可定位来源");
  });

  it("delegates provenance decisions to the Core resolver and does not use Proposal fallbacks", () => {
    const loadBlock = detailSource.slice(
      detailSource.indexOf("async function load()"),
      detailSource.indexOf("if (card === undefined)"),
    );
    expect(loadBlock).toContain("resolveKnowledgeProvenance");
    expect(loadBlock).not.toContain("proposal");
    expect(loadBlock).not.toContain("sourceEvidence.excerpt");
  });

  it("keeps both Message and Round source navigation read-only", () => {
    expect(conversationDetailSource).toContain(
      'const isRoundNavigation = new URLSearchParams(',
    );
    expect(conversationDetailSource).toContain('.has("round")');
    expect(conversationDetailSource).toContain(
      "initialMessageRequest.current === null && !isRoundNavigation",
    );
  });
});
