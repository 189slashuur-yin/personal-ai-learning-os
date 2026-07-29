import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const canonicalBrowserStoragePattern =
  /Browser(?:Conversation|Message|Round|Source|Proposal|KnowledgeCard|ConversationVersion)Storage/;

const businessPages = [
  "../src/app/analysis/analysis-result.tsx",
  "../src/app/conversation/[id]/round-workspace.tsx",
  "../src/app/conversation/[id]/conversation-workspace-mode.tsx",
  "../src/app/workspace/workspace-manager.tsx",
  "../src/app/tags/tag-manager.tsx",
  "../src/app/tasks/task-manager.tsx",
  "../src/app/today/today-view.tsx",
];

describe("PALOS v1.6.5 candidate — canonical storage boundaries", () => {
  it("keeps canonical BrowserStorage implementations behind the storage factory", () => {
    for (const path of businessPages) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source, path).not.toMatch(canonicalBrowserStoragePattern);
      expect(source, path).toContain("storage-factory");
    }
  });
});
