export const importOperationPhases = [
  "idle",
  "parsing",
  "preview-ready",
  "confirming",
  "importing",
  "flushing",
  "verifying",
  "success",
  "failed",
  "quota-stopped",
] as const;

export type ImportOperationPhase = (typeof importOperationPhases)[number];

export type ImportOperationProgress = {
  phase: ImportOperationPhase;
  processedConversations: number;
  selectedConversations: number;
  importedMessages: number;
  importedRounds: number;
  skippedMessages: number;
  unprocessedConversations: number;
  error?: string;
};

export function createImportOperationProgress(
  phase: ImportOperationPhase = "idle",
  selectedConversations = 0,
): ImportOperationProgress {
  return {
    phase,
    processedConversations: 0,
    selectedConversations,
    importedMessages: 0,
    importedRounds: 0,
    skippedMessages: 0,
    unprocessedConversations: selectedConversations,
  };
}

export function updateImportOperationProgress(
  current: ImportOperationProgress,
  update: Partial<ImportOperationProgress> & { phase: ImportOperationPhase },
): ImportOperationProgress {
  const next = { ...current, ...update };
  return {
    ...next,
    unprocessedConversations: Math.max(
      0,
      next.selectedConversations - next.processedConversations,
    ),
    ...(next.phase === "failed" && !next.error
      ? { error: "Import failed." }
      : {}),
  };
}

export function failImportOperation(
  current: ImportOperationProgress,
  error: string,
): ImportOperationProgress {
  return updateImportOperationProgress(current, {
    phase: "failed",
    error,
  });
}

export function isImportOperationBusy(phase: ImportOperationPhase): boolean {
  return ["parsing", "confirming", "importing", "flushing", "verifying"].includes(
    phase,
  );
}

export function importPhaseLabel(phase: ImportOperationPhase): string {
  const labels: Record<ImportOperationPhase, string> = {
    idle: "Idle",
    parsing: "Parsing",
    "preview-ready": "Preview ready",
    confirming: "Confirming",
    importing: "Importing",
    flushing: "Flushing to storage",
    verifying: "Verifying persisted data",
    success: "Success",
    failed: "Failed",
    "quota-stopped": "Stopped by storage quota",
  };
  return labels[phase];
}
