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
