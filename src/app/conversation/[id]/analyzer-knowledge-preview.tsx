"use client";

import { useEffect, useState } from "react";
import type { KnowledgeReuseAuditItem } from "@/core/entities/knowledge-context-ref";
import { resolveAnalyzerKnowledgeContext } from "@/infrastructure/storage/analyzer-knowledge-context";
import { knowledgeAuditSnapshotFingerprint } from "@/core/services/knowledge-context-service";

type Props = {
  conversationId: string;
  revision: unknown;
  excludedIds: string[];
  onChange: (excludedIds: string[], effectiveIds: string[], fingerprint: string, completeFingerprint: string) => void;
};

export function AnalyzerKnowledgePreview({ conversationId, revision, excludedIds, onChange }: Props) {
  const [items, setItems] = useState<KnowledgeReuseAuditItem[] | null>(null);
  const [error, setError] = useState("");

  async function reload() {
    try {
      const current = await resolveAnalyzerKnowledgeContext(conversationId);
      setItems(current);
      setError("");
      const validExcluded = excludedIds.filter((id) => current.some((item) => item.knowledgeCardId === id));
      const effective = current.filter((item) => !validExcluded.includes(item.knowledgeCardId));
      onChange(validExcluded, effective.map((item) => item.knowledgeCardId), knowledgeAuditSnapshotFingerprint(effective), knowledgeAuditSnapshotFingerprint(current));
    } catch (cause) {
      setItems(null);
      setError(cause instanceof Error ? cause.message : "Could not read Referenced Knowledge.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [conversationId, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  if (items === null) return <p className="text-xs text-amber-700">{error || "Loading Knowledge for this run…"}</p>;
  if (items.length === 0) return null;
  const included = items.filter((item) => !excludedIds.includes(item.knowledgeCardId));
  return <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-left text-xs text-zinc-700">
    <div className="flex items-center justify-between gap-2">
      <p className="font-semibold">Referenced Knowledge for this run · {included.length}/{items.length}</p>
      <button className="text-sky-700 underline" onClick={() => void reload()} type="button">Refresh preview</button>
    </div>
    <p className="mt-1">Temporary exclusions affect this run only. Add or refresh saved snapshots in Referenced Knowledge.</p>
    <ul className="mt-2 space-y-1">{items.map((item) => <li key={item.knowledgeCardId}>
      <label className="flex items-start gap-2"><input aria-label={`Use ${item.titleSnapshot}`} checked={!excludedIds.includes(item.knowledgeCardId)} onChange={(event) => {
        const next = event.target.checked ? excludedIds.filter((id) => id !== item.knowledgeCardId) : [...excludedIds, item.knowledgeCardId];
        const effective = items.filter((entry) => !next.includes(entry.knowledgeCardId));
        onChange(next, effective.map((entry) => entry.knowledgeCardId), knowledgeAuditSnapshotFingerprint(effective), knowledgeAuditSnapshotFingerprint(items));
      }} type="checkbox" /><span>{item.titleSnapshot}{item.sourceStatus === "snapshot-only" ? " · Source unavailable, saved snapshot" : item.sourceStatus === "archived-warning" ? " · Archived source" : item.sourceStatus === "updated" ? " · Source updated, using saved snapshot" : ""}</span></label>
    </li>)}</ul>
  </div>;
}
