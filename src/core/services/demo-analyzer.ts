import type { ImportedSource } from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import { DemoProvider } from "@/core/services/demo-provider";

const demoProvider = new DemoProvider();

/** @deprecated Use an AnalyzerProvider from ProviderRegistry instead. */
export function analyzeSource(source: ImportedSource) {
  return demoProvider.analyzeSource(source);
}

/** @deprecated Use an AnalyzerProvider from ProviderRegistry instead. */
export function analyzeMessages(
  conversationId: string,
  selectedMessages: Message[],
) {
  return demoProvider.analyzeMessages(conversationId, selectedMessages);
}
