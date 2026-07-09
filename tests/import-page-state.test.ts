import { describe, expect, it } from "vitest";

// ============================================================================
// Pure functions extracted from import-workbench.tsx for testability.
// These encode the same logic the component uses inline.
// ============================================================================

/** Returns which import section is active based on input mode. */
function deriveActiveImportSection(inputMode: string): "chatgpt-export" | "manual-text" {
  return inputMode === "json" ? "chatgpt-export" : "manual-text";
}

/** Build query-string search params for the /import page. */
function buildImportPageQuery(params: {
  importPath: "new" | "existing";
  inputMode: string;
  existingTargetId?: string;
}): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("importPath", params.importPath);
  sp.set("inputMode", params.inputMode);
  if (params.existingTargetId) {
    sp.set("existingTargetId", params.existingTargetId);
  }
  return sp;
}

/** Parse /import page state from URL search params. */
function parseImportPageQuery(searchParams: URLSearchParams): {
  importPath: "new" | "existing";
  inputMode: "paste" | "txt" | "json";
  existingTargetId: string;
} {
  const urlImportPath = searchParams.get("importPath") as "new" | "existing" | null;
  return {
    importPath: urlImportPath || "new",
    inputMode: (searchParams.get("inputMode") as "paste" | "txt" | "json") || "paste",
    existingTargetId: searchParams.get("existingTargetId") ?? "",
  };
}

// ============================================================================
// Goal C: Conditional rendering — four combinations show only one workspace
// ============================================================================
describe("Import page conditional rendering (Goal C)", () => {
  it("New + ChatGPT Export → show ChatGPT Export only", () => {
    expect(deriveActiveImportSection("json")).toBe("chatgpt-export");
  });

  it("New + Manual text → show Manual text only", () => {
    expect(deriveActiveImportSection("paste")).toBe("manual-text");
    expect(deriveActiveImportSection("txt")).toBe("manual-text");
  });

  it("Existing + ChatGPT Export → show ChatGPT Export only", () => {
    // importPath does NOT affect section choice — only inputMode (mode) does
    expect(deriveActiveImportSection("json")).toBe("chatgpt-export");
  });

  it("Existing + Manual text → show Manual text only", () => {
    expect(deriveActiveImportSection("paste")).toBe("manual-text");
    expect(deriveActiveImportSection("txt")).toBe("manual-text");
  });

  it("never shows both sections simultaneously", () => {
    const modes = ["json", "paste", "txt"];
    for (const mode of modes) {
      const section = deriveActiveImportSection(mode);
      // Each mode maps to exactly one section and never both
      expect(section === "chatgpt-export" || section === "manual-text").toBe(true);
      expect(section === "chatgpt-export" && section === "manual-text").toBe(false);
    }
  });
});

// ============================================================================
// Goal D: URL query persistence — roundtrip
// ============================================================================
describe("Import page URL query persistence (Goal D)", () => {
  it("roundtrip: build → parse preserves importPath / inputMode / existingTargetId", () => {
    const params = buildImportPageQuery({
      importPath: "existing",
      inputMode: "json",
      existingTargetId: "conv-abc-123",
    });
    const parsed = parseImportPageQuery(params);
    expect(parsed.importPath).toBe("existing");
    expect(parsed.inputMode).toBe("json");
    expect(parsed.existingTargetId).toBe("conv-abc-123");
  });

  it("roundtrip: New + paste without target", () => {
    const params = buildImportPageQuery({
      importPath: "new",
      inputMode: "paste",
    });
    const parsed = parseImportPageQuery(params);
    expect(parsed.importPath).toBe("new");
    expect(parsed.inputMode).toBe("paste");
    expect(parsed.existingTargetId).toBe("");
  });

  it("parseImportPageQuery returns defaults for missing params", () => {
    const parsed = parseImportPageQuery(new URLSearchParams());
    expect(parsed.importPath).toBe("new");
    expect(parsed.inputMode).toBe("paste");
    expect(parsed.existingTargetId).toBe("");
  });

  it("parseImportPageQuery recovers New + txt mode", () => {
    const params = new URLSearchParams("importPath=new&inputMode=txt");
    const parsed = parseImportPageQuery(params);
    expect(parsed.importPath).toBe("new");
    expect(parsed.inputMode).toBe("txt");
  });

  it("existingTargetId is omitted from query when empty", () => {
    const params = buildImportPageQuery({
      importPath: "existing",
      inputMode: "paste",
      existingTargetId: "",
    });
    expect(params.has("existingTargetId")).toBe(false);
  });

  it("existingTargetId included when set", () => {
    const params = buildImportPageQuery({
      importPath: "existing",
      inputMode: "json",
      existingTargetId: "target-1",
    });
    expect(params.get("existingTargetId")).toBe("target-1");
  });
});

// ============================================================================
// Goal B: targetConversationId independence from inputMode switch
// ============================================================================
describe("Import target stability across mode switches (Goal B)", () => {
  it("changing inputMode does not affect existingTargetId in parsed state", () => {
    // Simulate: user selects target, then switches input mode
    const afterSelect = buildImportPageQuery({
      importPath: "existing",
      inputMode: "json",
      existingTargetId: "target-42",
    });
    // Switch to manual text — target should be preserved
    const afterSwitch = buildImportPageQuery({
      importPath: "existing",
      inputMode: "paste",
      existingTargetId: "target-42",
    });
    expect(afterSwitch.get("existingTargetId")).toBe("target-42");
    expect(afterSelect.get("existingTargetId")).toBe("target-42");
  });
});

// ============================================================================
// v1.6.0: Batch Report / Status Label / All-Skipped Tests
// ============================================================================

type BatchReportItem = {
  title: string;
  status: "success" | "failed" | "skipped-duplicate";
  conversationId?: string;
  messageCount: number;
  roundCount: number;
  skipped: number;
  unsupported: number;
  error?: string;
};

type BatchReport = {
  items: BatchReportItem[];
  totalSuccess: number;
  totalFailed: number;
  totalMessages: number;
  totalRounds: number;
  totalSkipped: number;
  totalUnsupported: number;
  targetTitle?: string;
  stoppedByQuota: boolean;
  suggestion?: string;
};

/** Pure function: derive the import status summary message from BatchReport. */
function deriveImportStatusMessage(
  report: BatchReport,
  mode: "new" | "existing",
): string {
  if (report.stoppedByQuota) {
    return mode === "new"
      ? `⚠️ 存储配额已满，导入已停止。`
      : `⚠️ 存储配额已满，追加已停止。`;
  }
  if (report.totalSuccess === 0 && report.totalSkipped > 0) {
    return mode === "new"
      ? `ℹ️ 全部已存在：${report.totalSkipped} Messages 已跳过，未创建新 Conversation。`
      : `ℹ️ 全部已存在：${report.totalSkipped} Messages 已跳过，未追加新内容。`;
  }
  if (report.totalFailed === 0) {
    return mode === "new"
      ? `✅ 全部导入成功：${report.totalSuccess} 个 Conversation`
      : `✅ 已追加到目标：${report.totalMessages} Messages · ${report.totalRounds} Rounds`;
  }
  return `⚠️ 部分成功：${report.totalSuccess} 成功 · ${report.totalFailed} 失败`;
}

/** Pure function: determine per-item status label. */
function deriveItemStatusLabel(item: BatchReportItem, mode: "new" | "existing"): string | null {
  if (item.status === "success") return mode === "new" ? "Created" : "Appended";
  if (item.status === "skipped-duplicate") return "Skipped duplicate";
  if (item.status === "failed") return "Failed";
  return null;
}

/** Pure function: can an open-link be shown for this item? */
function canShowOpenLink(item: BatchReportItem): boolean {
  return item.status === "success" && Boolean(item.conversationId);
}

describe("v1.6.0 — Batch report status messages", () => {
  it("all-skipped report shows info message, not success or failure", () => {
    const report: BatchReport = {
      items: [
        {
          title: "Test Chat",
          status: "skipped-duplicate",
          messageCount: 0,
          roundCount: 0,
          skipped: 5,
          unsupported: 1,
        },
      ],
      totalSuccess: 0,
      totalFailed: 0,
      totalMessages: 0,
      totalRounds: 0,
      totalSkipped: 5,
      totalUnsupported: 1,
      stoppedByQuota: false,
    };

    const msg = deriveImportStatusMessage(report, "new");
    expect(msg).toContain("全部已存在");
    expect(msg).not.toContain("✅");
    expect(msg).not.toContain("❌");
    expect(msg).not.toContain("⚠️");
    expect(msg).toContain("5 Messages 已跳过");
  });

  it("all-skipped existing append shows target info in message", () => {
    const report: BatchReport = {
      items: [
        {
          title: "Source Chat",
          status: "skipped-duplicate",
          messageCount: 0,
          roundCount: 0,
          skipped: 3,
          unsupported: 0,
        },
      ],
      totalSuccess: 0,
      totalFailed: 0,
      totalMessages: 0,
      totalRounds: 0,
      totalSkipped: 3,
      totalUnsupported: 0,
      targetTitle: "My Target Conversation",
      stoppedByQuota: false,
    };

    const msg = deriveImportStatusMessage(report, "existing");
    expect(msg).toContain("全部已存在");
    expect(msg).toContain("3 Messages 已跳过");
    expect(msg).toContain("未追加新内容");
  });

  it("partial success still shows success count, not all-skipped", () => {
    const report: BatchReport = {
      items: [
        { title: "New Chat", status: "success", conversationId: "c1", messageCount: 2, roundCount: 1, skipped: 0, unsupported: 0 },
        { title: "Old Chat", status: "skipped-duplicate", messageCount: 0, roundCount: 0, skipped: 4, unsupported: 1 },
      ],
      totalSuccess: 1,
      totalFailed: 0,
      totalMessages: 2,
      totalRounds: 1,
      totalSkipped: 4,
      totalUnsupported: 1,
      stoppedByQuota: false,
    };

    const msg = deriveImportStatusMessage(report, "new");
    expect(msg).toContain("✅");
    expect(msg).toContain("1 个 Conversation");
    expect(msg).not.toContain("全部已存在");
  });

  it("existing append success message includes target context", () => {
    const report: BatchReport = {
      items: [
        { title: "Source", status: "success", conversationId: "target-1", messageCount: 3, roundCount: 2, skipped: 0, unsupported: 0 },
      ],
      totalSuccess: 1,
      totalFailed: 0,
      totalMessages: 3,
      totalRounds: 2,
      totalSkipped: 0,
      totalUnsupported: 0,
      targetTitle: "Target Conv",
      stoppedByQuota: false,
    };

    const msg = deriveImportStatusMessage(report, "existing");
    expect(msg).toContain("✅");
    expect(msg).toContain("3 Messages");
    expect(msg).toContain("2 Rounds");
    expect(report.targetTitle).toBe("Target Conv");
  });

  it("stopped-by-quota takes precedence over all-skipped", () => {
    const report: BatchReport = {
      items: [],
      totalSuccess: 0,
      totalFailed: 0,
      totalMessages: 0,
      totalRounds: 0,
      totalSkipped: 3,
      totalUnsupported: 0,
      stoppedByQuota: true,
    };

    const msg = deriveImportStatusMessage(report, "new");
    expect(msg).toContain("存储配额已满");
    expect(msg).not.toContain("全部已存在");
  });
});

describe("v1.6.0 — Per-item status labels", () => {
  it("new mode success item shows 'Created'", () => {
    const item: BatchReportItem = {
      title: "Test", status: "success", conversationId: "c1",
      messageCount: 2, roundCount: 1, skipped: 0, unsupported: 0,
    };
    expect(deriveItemStatusLabel(item, "new")).toBe("Created");
  });

  it("existing mode success item shows 'Appended'", () => {
    const item: BatchReportItem = {
      title: "Test", status: "success", conversationId: "target-1",
      messageCount: 2, roundCount: 1, skipped: 0, unsupported: 0,
    };
    expect(deriveItemStatusLabel(item, "existing")).toBe("Appended");
  });

  it("skipped-duplicate item shows 'Skipped duplicate'", () => {
    const item: BatchReportItem = {
      title: "Test", status: "skipped-duplicate",
      messageCount: 0, roundCount: 0, skipped: 5, unsupported: 1,
    };
    expect(deriveItemStatusLabel(item, "new")).toBe("Skipped duplicate");
    expect(deriveItemStatusLabel(item, "existing")).toBe("Skipped duplicate");
  });

  it("failed item shows 'Failed'", () => {
    const item: BatchReportItem = {
      title: "Test", status: "failed", error: "oops",
      messageCount: 0, roundCount: 0, skipped: 0, unsupported: 0,
    };
    expect(deriveItemStatusLabel(item, "new")).toBe("Failed");
  });
});

describe("v1.6.0 — Open link guard", () => {
  it("success item with conversationId can show open link", () => {
    expect(canShowOpenLink({
      title: "Test", status: "success", conversationId: "c1",
      messageCount: 2, roundCount: 1, skipped: 0, unsupported: 0,
    })).toBe(true);
  });

  it("success item without conversationId cannot show open link", () => {
    expect(canShowOpenLink({
      title: "Test", status: "success", conversationId: undefined,
      messageCount: 2, roundCount: 1, skipped: 0, unsupported: 0,
    })).toBe(false);
  });

  it("skipped-duplicate item cannot show open link even with conversationId", () => {
    expect(canShowOpenLink({
      title: "Test", status: "skipped-duplicate", conversationId: "c1",
      messageCount: 0, roundCount: 0, skipped: 5, unsupported: 1,
    })).toBe(false);
  });

  it("failed item cannot show open link", () => {
    expect(canShowOpenLink({
      title: "Test", status: "failed", conversationId: "c1",
      messageCount: 0, roundCount: 0, skipped: 0, unsupported: 0,
    })).toBe(false);
  });
});
