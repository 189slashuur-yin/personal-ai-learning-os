import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { KnowledgeContextRef, KnowledgeReuseAuditItem } from "@/core/entities/knowledge-context-ref";

export const MAX_KNOWLEDGE_CONTEXT_REFS = 5;
export const MAX_KNOWLEDGE_CONTEXT_REF_CONTENT_CHARS = 4_000;
export const MAX_KNOWLEDGE_CONTEXT_TOTAL_CONTENT_CHARS = 16_000;
const MAX_TITLE_CHARS = 200;

export type KnowledgeResolution =
  | { status: "ok" | "archived-warning"; ref: KnowledgeContextRef }
  | { status: "requires-truncation-confirmation"; ref: KnowledgeContextRef }
  | { status: "blocked-over-budget" | "missing" | "duplicate" | "too-many" | "invalid" };
export type KnowledgeSourceStatus = "current" | "updated" | "archived-warning" | "snapshot-only";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function iso(value: unknown): value is string {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}
export function validateKnowledgeRefs(value: unknown): value is KnowledgeContextRef[] {
  if (!Array.isArray(value) || value.length > MAX_KNOWLEDGE_CONTEXT_REFS) return false;
  const seen = new Set<string>();
  let total = 0;
  for (let i = 0; i < value.length; i++) {
    const ref = value[i];
    if (!record(ref) || !nonEmpty(ref.knowledgeCardId) || seen.has(ref.knowledgeCardId) ||
      !nonEmpty(ref.titleSnapshot) || ref.titleSnapshot.length > MAX_TITLE_CHARS ||
      !nonEmpty(ref.contentSnapshot) || ref.contentSnapshot.length > MAX_KNOWLEDGE_CONTEXT_REF_CONTENT_CHARS ||
      !iso(ref.knowledgeUpdatedAtSnapshot) || ref.order !== i ||
      typeof ref.originalContentLength !== "number" || !Number.isSafeInteger(ref.originalContentLength) || ref.originalContentLength < ref.contentSnapshot.length ||
      ref.contentTruncated !== (ref.originalContentLength > ref.contentSnapshot.length)) return false;
    seen.add(ref.knowledgeCardId);
    total += ref.contentSnapshot.length;
  }
  return total <= MAX_KNOWLEDGE_CONTEXT_TOTAL_CONTENT_CHARS;
}
export function validateKnowledgeAudit(value: unknown): value is KnowledgeReuseAuditItem[] {
  if (!Array.isArray(value)) return false;
  if (value.some((item) => record(item) && item.sourceStatus !== undefined &&
    !["current", "updated", "archived-warning", "snapshot-only"].includes(item.sourceStatus as string))) return false;
  return validateKnowledgeRefs(value.map((item, order) => record(item) ? { ...item, order } : item));
}
export function selection(refs: KnowledgeContextRef[] | undefined): KnowledgeContextRef[] {
  return refs ?? [];
}
export function sourceStatus(ref: KnowledgeContextRef, card: KnowledgeCard | null): KnowledgeSourceStatus {
  if (!card) return "snapshot-only";
  if (card.status === "Archived") return "archived-warning";
  return card.updatedAt === ref.knowledgeUpdatedAtSnapshot ? "current" : "updated";
}
export function resolveKnowledgeAddOrRefresh(
  card: KnowledgeCard | null,
  current: KnowledgeContextRef[],
  mode: "add" | "refresh",
  confirmedTruncation = false,
): KnowledgeResolution {
  if (!card) return { status: "missing" };
  if (!validateKnowledgeRefs(current)) return { status: "invalid" };
  const index = current.findIndex((ref) => ref.knowledgeCardId === card.id);
  if (mode === "add" && index >= 0) return { status: "duplicate" };
  if (mode === "refresh" && index < 0) return { status: "missing" };
  if (mode === "add" && current.length >= MAX_KNOWLEDGE_CONTEXT_REFS) return { status: "too-many" };
  const content = card.content.trim();
  const title = card.title.trim().slice(0, MAX_TITLE_CHARS);
  if (!content || !title || !iso(card.updatedAt)) return { status: "invalid" };
  const snapshot = content.slice(0, MAX_KNOWLEDGE_CONTEXT_REF_CONTENT_CHARS);
  const ref: KnowledgeContextRef = {
    knowledgeCardId: card.id, titleSnapshot: title, contentSnapshot: snapshot,
    knowledgeUpdatedAtSnapshot: card.updatedAt,
    order: mode === "add" ? current.length : index,
    originalContentLength: content.length, contentTruncated: content.length > snapshot.length,
  };
  const total = current.reduce((sum, item, itemIndex) => sum + (itemIndex === index ? 0 : item.contentSnapshot.length), snapshot.length);
  if (total > MAX_KNOWLEDGE_CONTEXT_TOTAL_CONTENT_CHARS) return { status: "blocked-over-budget" };
  if (ref.contentTruncated && !confirmedTruncation) return { status: "requires-truncation-confirmation", ref };
  return { status: card.status === "Archived" ? "archived-warning" : "ok", ref };
}
export function replaceKnowledgeRef(current: KnowledgeContextRef[], ref: KnowledgeContextRef): KnowledgeContextRef[] {
  const index = current.findIndex((item) => item.knowledgeCardId === ref.knowledgeCardId);
  const next = [...current];
  if (index < 0) next.push(ref); else next[index] = ref;
  const ordered = next.map((item, order) => ({ ...item, order }));
  if (!validateKnowledgeRefs(ordered)) throw new Error("Invalid Knowledge Context selection.");
  return ordered;
}
export function makeKnowledgeReuseAudit(refs: KnowledgeContextRef[], statuses?: Map<string, KnowledgeSourceStatus>): KnowledgeReuseAuditItem[] {
  if (!validateKnowledgeRefs(refs)) throw new Error("Invalid Knowledge Context selection.");
  return refs.map((ref) => ({
    knowledgeCardId: ref.knowledgeCardId, titleSnapshot: ref.titleSnapshot,
    contentSnapshot: ref.contentSnapshot, knowledgeUpdatedAtSnapshot: ref.knowledgeUpdatedAtSnapshot,
    originalContentLength: ref.originalContentLength, contentTruncated: ref.contentTruncated,
    ...(statuses?.has(ref.knowledgeCardId) ? { sourceStatus: statuses.get(ref.knowledgeCardId) } : {}),
  }));
}

/** Compares the frozen input shown in a run preview with the input resolved at execution. */
export function knowledgeAuditSnapshotFingerprint(items: KnowledgeReuseAuditItem[]): string {
  return JSON.stringify(items.map((item) => ({
    knowledgeCardId: item.knowledgeCardId,
    titleSnapshot: item.titleSnapshot,
    contentSnapshot: item.contentSnapshot,
    knowledgeUpdatedAtSnapshot: item.knowledgeUpdatedAtSnapshot,
    originalContentLength: item.originalContentLength,
    contentTruncated: item.contentTruncated,
  })));
}
