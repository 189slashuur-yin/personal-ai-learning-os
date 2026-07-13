import { getPendingWriteCount } from "@/infrastructure/storage/indexeddb/database";

export const BULK_DIAGNOSTIC_PREFIX = "[PALOS BULK DIAG]";

const MAX_DIAGNOSTIC_ENTRIES = 300;
export type BulkDiagnosticOperationType =
  | "bulk-chatgpt-import"
  | "batch-delete"
  | "clear-app-data";

export type BulkDiagnosticOperation = {
  operationId: string;
  operationType: BulkDiagnosticOperationType;
  startedAt: string;
  startedAtMs: number;
};

export type BulkDiagnosticEntry = {
  timestamp: string;
  operationId: string;
  operationType: BulkDiagnosticOperationType;
  phase: string;
  elapsedMs: number;
  pendingWriteCount: number;
  data?: Record<string, unknown>;
};

export type DestructiveOperationSummary = {
  operationId: string;
  operationType: "batch-delete" | "clear-app-data";
  completedAt: string;
  finalEntityCounts?: Record<string, number>;
};

const diagnosticEntries: BulkDiagnosticEntry[] = [];
let lastDestructiveOperation: DestructiveOperationSummary | null = null;

function monotonicNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function createOperationId(operationType: BulkDiagnosticOperationType): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${operationType}-${suffix}`;
}

export function startBulkDiagnosticOperation(
  operationType: BulkDiagnosticOperationType,
  data?: Record<string, unknown>,
): BulkDiagnosticOperation {
  const operation: BulkDiagnosticOperation = {
    operationId: createOperationId(operationType),
    operationType,
    startedAt: new Date().toISOString(),
    startedAtMs: monotonicNow(),
  };
  recordBulkDiagnostic(operation, "before operation", data);
  return operation;
}

export function recordBulkDiagnostic(
  operation: BulkDiagnosticOperation,
  phase: string,
  data?: Record<string, unknown>,
): BulkDiagnosticEntry {
  const entry: BulkDiagnosticEntry = {
    timestamp: new Date().toISOString(),
    operationId: operation.operationId,
    operationType: operation.operationType,
    phase,
    elapsedMs: Math.max(0, Math.round(monotonicNow() - operation.startedAtMs)),
    pendingWriteCount: getPendingWriteCount(),
    ...(data ? { data } : {}),
  };

  diagnosticEntries.push(entry);
  if (diagnosticEntries.length > MAX_DIAGNOSTIC_ENTRIES) {
    diagnosticEntries.splice(
      0,
      diagnosticEntries.length - MAX_DIAGNOSTIC_ENTRIES,
    );
  }
  console.info(BULK_DIAGNOSTIC_PREFIX, entry);
  return entry;
}

export function completeDestructiveDiagnosticOperation(
  operation: BulkDiagnosticOperation,
  finalEntityCounts?: Record<string, number>,
): void {
  if (
    operation.operationType !== "batch-delete" &&
    operation.operationType !== "clear-app-data"
  ) {
    return;
  }
  lastDestructiveOperation = {
    operationId: operation.operationId,
    operationType: operation.operationType,
    completedAt: new Date().toISOString(),
    finalEntityCounts,
  };
}

export function getLastDestructiveDiagnosticOperation():
  | DestructiveOperationSummary
  | null {
  return lastDestructiveOperation
    ? { ...lastDestructiveOperation }
    : null;
}

export function getBulkDiagnosticEntries(): BulkDiagnosticEntry[] {
  return diagnosticEntries.map((entry) => ({
    ...entry,
    data: entry.data ? { ...entry.data } : undefined,
  }));
}

export function formatBulkDiagnostics(): string {
  return JSON.stringify(
    {
      prefix: BULK_DIAGNOSTIC_PREFIX,
      generatedAt: new Date().toISOString(),
      entryCount: diagnosticEntries.length,
      entries: getBulkDiagnosticEntries(),
    },
    null,
    2,
  );
}

export function resetBulkDiagnosticsForTests(): void {
  diagnosticEntries.splice(0, diagnosticEntries.length);
  lastDestructiveOperation = null;
}
