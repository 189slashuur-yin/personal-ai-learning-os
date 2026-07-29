export function shouldShowAnalyzerFailureInjection(
  diagnosticsFlag?: string,
): boolean {
  return diagnosticsFlag === "1";
}
