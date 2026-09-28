import type { Message } from "@/core/entities/message";
import { AnalyzerOutputValidationError } from "@/core/services/analyzer-output-validator";

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** A saved excerpt must be locatable in the primary input, never solely in reused Knowledge. */
export function validatePrimaryEvidence(excerpt: string, primary: string | Message[]): void {
  const candidate = normalize(excerpt).replace(/…$/, "").trim();
  const label = (message: Message) => message.role === "user" ? "User" : message.role === "assistant" ? "Assistant" : message.role === "system" ? "System" : "Unknown";
  const texts = typeof primary === "string"
    ? [primary]
    : [
        ...primary.map((message) => message.content),
        primary.map((message) => `${label(message)}：${message.content.trim()}`).join("\n\n"),
        primary.map((message) => `${label(message)}: ${message.content.trim()}`).join("\n\n"),
      ];
  if (!candidate || !texts.some((text) => normalize(text).includes(candidate))) {
    throw new AnalyzerOutputValidationError(["evidence 必须是主 Source 或选中 Messages 中可定位的原文摘录"]);
  }
}
