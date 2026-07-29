import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BULK_DIAGNOSTIC_PREFIX,
  completeDestructiveDiagnosticOperation,
  formatBulkDiagnostics,
  getBulkDiagnosticEntries,
  getLastDestructiveDiagnosticOperation,
  isBulkDiagnosticsEnabled,
  recordBulkDiagnostic,
  resetBulkDiagnosticsForTests,
  sanitizeDiagnosticData,
  startBulkDiagnosticOperation,
} from "@/infrastructure/diagnostics/bulk-data-diagnostics";
import { shouldShowAnalyzerFailureInjection } from "@/core/services/analyzer-diagnostics";

describe("PALOS bulk diagnostics buffer", () => {
  beforeEach(() => {
    resetBulkDiagnosticsForTests();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetBulkDiagnosticsForTests();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("keeps production diagnostics hidden by default and gates console output", () => {
    vi.stubEnv("NEXT_PUBLIC_PALOS_DIAGNOSTICS", "0");
    const operation = startBulkDiagnosticOperation("bulk-chatgpt-import");
    expect(isBulkDiagnosticsEnabled()).toBe(false);
    expect(console.info).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_PALOS_DIAGNOSTICS", "1");
    recordBulkDiagnostic(operation, "visible diagnostic");
    expect(isBulkDiagnosticsEnabled()).toBe(true);
    expect(console.info).toHaveBeenCalledTimes(1);
  });

  it("keeps analyzer and bulk diagnostic flags independent", () => {
    expect(isBulkDiagnosticsEnabled("1")).toBe(true);
    expect(isBulkDiagnosticsEnabled("0")).toBe(false);
    expect(shouldShowAnalyzerFailureInjection("1")).toBe(true);
    expect(shouldShowAnalyzerFailureInjection("0")).toBe(false);
  });

  it("replaces long ID arrays with counts and limited samples", () => {
    const ids = Array.from({ length: 50 }, (_, index) => `id-${index}`);
    expect(
      sanitizeDiagnosticData({
        requestedIds: ids,
        actualExistingIds: ids.slice(0, 40),
        remainingRequestedIds: ids.slice(0, 30),
      }),
    ).toMatchObject({
      requestedCount: 50,
      actualExistingCount: 40,
      remainingRequestedCount: 30,
      requestedSample: ids.slice(0, 10),
    });
  });

  it("keeps a bounded buffer with structured operation fields", () => {
    const operation = startBulkDiagnosticOperation("bulk-chatgpt-import", {
      selectedConversationCount: 100,
    });

    for (let index = 0; index < 304; index += 1) {
      recordBulkDiagnostic(operation, "in-memory mutation progress", {
        processedConversationCount: index + 1,
      });
    }

    const entries = getBulkDiagnosticEntries();
    expect(entries).toHaveLength(300);
    expect(entries.at(-1)).toMatchObject({
      operationId: operation.operationId,
      operationType: "bulk-chatgpt-import",
      phase: "in-memory mutation progress",
    });
    expect(entries.at(-1)?.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(entries.at(-1)?.pendingWriteCount).toBeGreaterThanOrEqual(0);
  });

  it("formats copyable diagnostics and remembers the last destructive operation", () => {
    const operation = startBulkDiagnosticOperation("clear-app-data", {
      indexedDBCountsBeforeClear: { conversations: 100 },
    });
    recordBulkDiagnostic(operation, "final state", {
      indexedDBCounts: { conversations: 0 },
    });
    completeDestructiveDiagnosticOperation(operation, { conversations: 0 });

    expect(getLastDestructiveDiagnosticOperation()).toMatchObject({
      operationId: operation.operationId,
      operationType: "clear-app-data",
      finalEntityCounts: { conversations: 0 },
    });

    const formatted = JSON.parse(formatBulkDiagnostics()) as {
      prefix: string;
      entryCount: number;
    };
    expect(formatted.prefix).toBe(BULK_DIAGNOSTIC_PREFIX);
    expect(formatted.entryCount).toBe(2);
  });
});
