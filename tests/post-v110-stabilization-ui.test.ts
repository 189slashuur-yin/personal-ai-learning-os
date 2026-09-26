import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dataManagementSource = readFileSync(
  new URL("../src/app/settings/data-management.tsx", import.meta.url),
  "utf8",
);
const conversationDetailSource = readFileSync(
  new URL(
    "../src/app/conversation/[id]/conversation-detail.tsx",
    import.meta.url,
  ),
  "utf8",
);
const reviewSource = readFileSync(
  new URL("../src/app/review/review-proposal.tsx", import.meta.url),
  "utf8",
);

describe("post-v1.10.0 production UX safeguards", () => {
  it("describes legacy migration as a destructive full replacement with a fresh preflight", () => {
    expect(dataManagementSource).toContain(
      "这是全量替换，不是合并或追加",
    );
    expect(dataManagementSource).toContain(
      "仅存在于 IndexedDB 的记录会被删除",
    );
    expect(dataManagementSource).toContain(
      "migratePreview.indexedDB[label] ?? 0} → {count",
    );
    expect(dataManagementSource).toContain(
      "数据在预览后发生变化，请重新预览并确认替换范围",
    );
    expect(dataManagementSource).not.toContain(
      "此工具只用于检测旧版本业务数据，并复制到 IndexedDB",
    );
  });

  it("regenerates Messages and removes their old Rounds in one guarded command", () => {
    expect(conversationDetailSource).toContain(
      "继续会替换 Messages 并删除这些 Round",
    );
    expect(conversationDetailSource).toContain("messages: state.messages");
    expect(conversationDetailSource).toContain("rounds: state.rounds");
    expect(conversationDetailSource).toContain("replaceRounds:");
    expect(conversationDetailSource).toContain(
      "roundStorage.replaceByConversationId(state.conversation.id, [])",
    );
    expect(conversationDetailSource).toContain(
      "messages, rounds: [], roundCount: 0",
    );
  });

  it("keeps failed Review decisions visible and blocks missing update targets", () => {
    expect(reviewSource).toContain("persistIndexedDBReviewDecision");
    expect(reviewSource).toContain(
      "目标 Knowledge 已不存在，更新建议未接受",
    );
    expect(reviewSource).toContain('role="alert"');
  });
});
