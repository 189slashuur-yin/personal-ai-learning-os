import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { shouldShowAnalyzerFailureInjection } from "@/core/services/analyzer-diagnostics";
import {
  beginNoteEditing,
  cancelNoteEditing,
  createNoteEditorState,
  getNoteEditorVisibility,
  saveNoteEditing,
  updateNoteDraft,
} from "@/core/services/note-editing";
import {
  calculateContainedScrollTop,
  shouldAdjustNavigatorScroll,
  shouldScrollDocumentForRoundActivation,
} from "@/core/services/round-navigation";
import { resolveProposalReviewLookup } from "@/core/services/proposal-review-lookup";

const conversationDetailSource = readFileSync(
  new URL("../src/app/conversation/[id]/conversation-detail.tsx", import.meta.url),
  "utf8",
);
const roundNavigatorSource = readFileSync(
  new URL("../src/app/conversation/[id]/round-navigator.tsx", import.meta.url),
  "utf8",
);

describe("PALOS v1.6.3 — Note editor state", () => {
  it("keeps preview and editor mutually exclusive", () => {
    const preview = createNoteEditorState("saved note");
    expect(getNoteEditorVisibility(preview.mode)).toEqual({
      showPreview: true,
      showEditor: false,
    });

    const editing = beginNoteEditing(preview);
    expect(getNoteEditorVisibility(editing.mode)).toEqual({
      showPreview: false,
      showEditor: true,
    });
  });

  it("keeps Conversation Summary and Conversation Note labels and interactions distinct", () => {
    expect(conversationDetailSource).toContain(
      "Conversation Summary / 对话总结",
    );
    expect(conversationDetailSource).toContain(
      "Conversation Note / 对话备注",
    );
    expect(conversationDetailSource).toContain("编辑对话备注");
    expect(conversationDetailSource).not.toContain(">备注 / Note<");
    expect(conversationDetailSource).not.toContain("Auto-save on");
    expect(
      conversationDetailSource.match(
        /aria-label="Conversation Note \/ 对话备注"/g,
      ),
    ).toHaveLength(1);
    expect(conversationDetailSource).toContain(
      "conversationNoteVisibility.showEditor ?",
    );
    expect(conversationDetailSource).toContain(
      "conversationNoteVisibility.showPreview ?",
    );
  });

  it("cancel restores the saved value and save promotes the draft", () => {
    const editing = updateNoteDraft(
      beginNoteEditing(createNoteEditorState("original")),
      "updated",
    );

    expect(cancelNoteEditing(editing)).toEqual({
      mode: "preview",
      savedValue: "original",
      draftValue: "original",
    });
    expect(saveNoteEditing(editing)).toEqual({
      mode: "preview",
      savedValue: "updated",
      draftValue: "updated",
    });
  });
});

describe("PALOS v1.6.3 — contained Round Navigator scrolling", () => {
  it("does not scroll when the active item is already visible", () => {
    const target = calculateContainedScrollTop({
      containerScrollTop: 100,
      containerClientHeight: 240,
      itemOffsetTop: 140,
      itemOffsetHeight: 32,
    });
    expect(target).toBe(100);
    expect(shouldAdjustNavigatorScroll(100, target)).toBe(false);
  });

  it("adjusts only the container when the active item is above it", () => {
    expect(
      calculateContainedScrollTop({
        containerScrollTop: 160,
        containerClientHeight: 240,
        itemOffsetTop: 90,
        itemOffsetHeight: 32,
        padding: 8,
      }),
    ).toBe(82);
  });

  it("adjusts only the container when the active item is below it", () => {
    expect(
      calculateContainedScrollTop({
        containerScrollTop: 100,
        containerClientHeight: 200,
        itemOffsetTop: 310,
        itemOffsetHeight: 30,
        padding: 8,
      }),
    ).toBe(148);
  });

  it("has no document scroll input and reserves document scrolling for clicks", () => {
    expect(shouldScrollDocumentForRoundActivation("observer")).toBe(false);
    expect(shouldScrollDocumentForRoundActivation("user")).toBe(true);
  });

  it("places the sticky rail at the page-level wrapper spanning the lower detail sections", () => {
    expect(conversationDetailSource).toContain(
      'data-testid="conversation-detail-navigator-layout"',
    );
    expect(conversationDetailSource).toContain(
      'className="sticky top-20 z-20 self-start"',
    );
    expect(conversationDetailSource).toMatch(
      /data-testid="conversation-detail-navigator-layout"[\s\S]*<RoundNavigator conversationId=\{conversation\.id\} \/>[\s\S]*id="section-knowledge"/,
    );
    expect(roundNavigatorSource).toContain(
      'data-testid="round-navigator-scroll-container"',
    );
  });

  it("keeps observer activation limited to the navigator scroll container", () => {
    const observerSection = roundNavigatorSource.slice(
      roundNavigatorSource.indexOf("new IntersectionObserver"),
      roundNavigatorSource.indexOf("function activateRound"),
    );
    expect(observerSection).toContain("container.scrollTo");
    expect(observerSection).not.toContain("window.scrollTo");
    expect(observerSection).not.toContain("scrollIntoView");
  });
});

describe("PALOS v1.6.3 — Review direct URL", () => {
  it("maps a deleted proposal lookup to the removed empty state", () => {
    expect(resolveProposalReviewLookup(null)).toEqual({
      status: "missing-proposal",
    });
  });
});

describe("PALOS v1.6.3 — analyzer failure diagnostics", () => {
  it("hides manual failure injection by default", () => {
    expect(shouldShowAnalyzerFailureInjection()).toBe(false);
    expect(shouldShowAnalyzerFailureInjection("0")).toBe(false);
    expect(conversationDetailSource).toContain(
      "providerDetails.id === \"demo\" && showAnalyzerFailureInjection",
    );
  });

  it("allows an explicit diagnostics flag without removing real error recovery UI", () => {
    expect(shouldShowAnalyzerFailureInjection("1")).toBe(true);
    expect(conversationDetailSource).toContain("模拟失败");
    expect(conversationDetailSource).toContain("Retry");
    expect(conversationDetailSource).toContain("Switch to Demo");
    expect(conversationDetailSource).toContain("Increase Timeout");
  });
});
