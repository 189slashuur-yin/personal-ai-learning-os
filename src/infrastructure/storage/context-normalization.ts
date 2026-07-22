import {
  conversationContextFields,
  type ConversationContext,
  type ConversationContextField,
} from "@/core/entities/conversation";
import type { RoundContext } from "@/core/entities/round";

export function normalizeStoredConversationContext(
  value: unknown,
): ConversationContext | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const context = Object.fromEntries(
    conversationContextFields.flatMap((field) => {
      const fieldValue = source[field];
      return typeof fieldValue === "string" && fieldValue.trim()
        ? [[field, fieldValue.trim()]]
        : [];
    }),
  ) as ConversationContext;

  return Object.keys(context).length ? context : undefined;
}

export function normalizeStoredRoundContext(
  value: unknown,
): RoundContext | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const inheritanceMode =
    source.inheritanceMode === "exclude" ? "exclude" : "inherit";
  const excludedFields = Array.isArray(source.excludedFields)
    ? conversationContextFields.filter((field) =>
        (source.excludedFields as unknown[]).includes(field),
      )
    : [];
  const context: RoundContext = {
    inheritanceMode,
    sourceRoundId:
      typeof source.sourceRoundId === "string" && source.sourceRoundId.trim()
        ? source.sourceRoundId.trim()
        : undefined,
    excludedFields: excludedFields.length
      ? (excludedFields as ConversationContextField[])
      : undefined,
    overrides: normalizeStoredConversationContext(source.overrides),
    snapshot: normalizeStoredConversationContext(source.snapshot),
    confirmedAt:
      typeof source.confirmedAt === "string" && source.confirmedAt
        ? source.confirmedAt
        : undefined,
  };

  return context;
}
