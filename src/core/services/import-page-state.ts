export type ImportTargetMode = "new" | "existing";
export type ImportInputMode = "json" | "paste" | "txt";

export type ImportPageState = {
  importPath: ImportTargetMode;
  inputMode: ImportInputMode;
  existingTargetId: string;
};

function isImportPath(value: string | null): value is ImportTargetMode {
  return value === "new" || value === "existing";
}

function isInputMode(value: string | null): value is ImportInputMode {
  return value === "json" || value === "paste" || value === "txt";
}

export function parseImportPageState(searchParams: URLSearchParams): ImportPageState {
  const legacyTargetId = searchParams.get("targetConversationId") ?? "";
  const requestedTargetId = searchParams.get("existingTargetId") ?? legacyTargetId;
  const requestedPath = searchParams.get("importPath");
  const importPath = isImportPath(requestedPath)
    ? requestedPath
    : requestedTargetId
      ? "existing"
      : "new";

  return {
    importPath,
    inputMode: isInputMode(searchParams.get("inputMode"))
      ? searchParams.get("inputMode") as ImportInputMode
      : "paste",
    existingTargetId: importPath === "existing" ? requestedTargetId : "",
  };
}

export function buildImportPageSearch(
  currentSearch: string,
  state: ImportPageState,
): string {
  const params = new URLSearchParams(currentSearch);
  params.set("importPath", state.importPath);
  params.set("inputMode", state.inputMode);
  params.delete("targetConversationId");
  if (state.importPath === "existing" && state.existingTargetId) {
    params.set("existingTargetId", state.existingTargetId);
  } else {
    params.delete("existingTargetId");
  }
  return params.toString();
}

export function deriveActiveImportSection(
  inputMode: ImportInputMode,
): "chatgpt-export" | "paste-text" | "txt-file" {
  if (inputMode === "json") return "chatgpt-export";
  if (inputMode === "txt") return "txt-file";
  return "paste-text";
}

export function decodeUtf8Text(bytes: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
