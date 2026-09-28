"use client";

import Link from "next/link";
import { useState } from "react";
import type { KnowledgeContextRef } from "@/core/entities/knowledge-context-ref";
import { KnowledgeContextCommittedUnverifiedError, KnowledgeContextConflictError } from "@/core/contracts/knowledge-context-mutation-writer";
import { sourceStatus } from "@/core/services/knowledge-context-service";
import { createKnowledgeContextSelectionService } from "@/infrastructure/storage/storage-factory";

type Props = {
  conversationId: string;
  refs: KnowledgeContextRef[];
  onChanged: (refs: KnowledgeContextRef[]) => void;
};

function resolutionMessage(status: string): string {
  switch (status) {
    case "duplicate": return "This Knowledge is already referenced.";
    case "too-many": return "You can reference up to 5 Knowledge cards.";
    case "blocked-over-budget": return "The saved snapshots would exceed 16,000 characters. Remove a reference first.";
    case "missing": return "The source is unavailable. Your saved snapshot remains available.";
    default: return "This Knowledge could not be added. Refresh and try again.";
  }
}

export function ReferencedKnowledge({ conversationId, refs, onChanged }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const service = createKnowledgeContextSelectionService();
  const cards = service.listCards();
  const byId = new Map(cards.map((card) => [card.id, card]));
  const ordered = [...refs].sort((left, right) => left.order - right.order);

  async function run(action: () => Promise<{ knowledgeContextRefs: KnowledgeContextRef[] }>) {
    setBusy(true);
    setNotice("");
    try {
      const receipt = await action();
      onChanged(receipt.knowledgeContextRefs);
      setNotice("Saved and verified.");
    } catch (error) {
      if (error instanceof KnowledgeContextConflictError) {
        setNotice("Referenced Knowledge changed elsewhere. Reload this page and try again.");
      } else if (error instanceof KnowledgeContextCommittedUnverifiedError) {
        setNotice("The change may have been saved, but verification failed. Reload before editing again.");
      } else {
        setNotice("Could not save Referenced Knowledge. Reload and try again.");
      }
    } finally { setBusy(false); }
  }

  async function addOrRefresh(cardId: string, mode: "add" | "refresh") {
    const preview = service.preview(cardId, ordered, mode);
    if (preview.status === "requires-truncation-confirmation") {
      const confirmed = window.confirm(
        `Save a frozen snapshot of ${preview.ref.originalContentLength.toLocaleString()} characters? ` +
        `Only the first ${preview.ref.contentSnapshot.length.toLocaleString()} characters will be kept.`,
      );
      if (!confirmed) return;
      await run(async () => {
        const result = await service.addOrRefresh(conversationId, cardId, ordered, mode, true);
        if (!("refs" in result)) throw new Error(resolutionMessage(result.status));
        return { knowledgeContextRefs: result.refs };
      });
      return;
    }
    if (preview.status !== "ok" && preview.status !== "archived-warning") {
      setNotice(resolutionMessage(preview.status));
      return;
    }
    await run(async () => {
      const result = await service.addOrRefresh(conversationId, cardId, ordered, mode, false);
      if (!("refs" in result)) throw new Error(resolutionMessage(result.status));
      return { knowledgeContextRefs: result.refs };
    });
  }

  return <section className="mt-6 min-w-0 rounded-xl border border-zinc-200 bg-white p-5" id="referenced-knowledge">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Referenced Knowledge</h2>
        <p className="mt-1 text-sm text-zinc-600">保存的是添加时的快照；Knowledge 后续变化不会自动更新。</p>
        <p className="text-xs text-zinc-500">{ordered.length}/5 selected · Cards from any Conversation</p>
      </div>
      <div className="flex min-w-0 max-w-full gap-2">
        <select aria-label="Choose Knowledge" className="w-44 min-w-0 max-w-full rounded border border-zinc-300 px-2 py-1 text-sm" disabled={busy} onChange={(event) => setSelectedId(event.target.value)} value={selectedId}>
          <option value="">Choose Knowledge</option>
          {cards.map((card) => <option key={card.id} value={card.id}>{card.title}</option>)}
        </select>
        <button className="rounded bg-zinc-900 px-3 py-1 text-sm text-white disabled:opacity-40" disabled={busy || !selectedId} onClick={() => void addOrRefresh(selectedId, "add")} type="button">Add</button>
      </div>
    </div>
    {notice ? <p aria-live="polite" className="mt-3 text-sm text-amber-800">{notice}</p> : null}
    {ordered.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No Knowledge referenced yet.</p> :
      <ol className="mt-4 space-y-3">{ordered.map((ref, index) => {
        const card = byId.get(ref.knowledgeCardId) ?? null;
        const status = sourceStatus(ref, card);
        const updated = card && card.updatedAt !== ref.knowledgeUpdatedAtSnapshot;
        return <li className="rounded-lg border border-zinc-200 p-3" key={ref.knowledgeCardId}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><span className="font-medium">{index + 1}. {ref.titleSnapshot}</span>
              {card ? <Link className="ml-2 text-sm text-sky-700 underline" href={`/knowledge/${encodeURIComponent(card.id)}`}>Open source</Link> : null}
              <p className="text-xs text-zinc-500">Saved snapshot · {ref.contentSnapshot.length.toLocaleString()} characters{ref.contentTruncated ? ` of ${ref.originalContentLength.toLocaleString()}` : ""}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <button disabled={busy || index === 0} onClick={() => void run(() => service.move(conversationId, ordered, ref.knowledgeCardId, -1))} type="button">↑</button>
              <button disabled={busy || index === ordered.length - 1} onClick={() => void run(() => service.move(conversationId, ordered, ref.knowledgeCardId, 1))} type="button">↓</button>
              <button disabled={busy || !card} onClick={() => void addOrRefresh(ref.knowledgeCardId, "refresh")} type="button">Refresh snapshot</button>
              <button disabled={busy} onClick={() => void run(() => service.remove(conversationId, ordered, ref.knowledgeCardId))} type="button">Remove</button>
            </div>
          </div>
          {status === "snapshot-only" ? <p className="mt-2 text-sm text-amber-800">Source unavailable — using saved snapshot</p> : null}
          {card?.status === "Archived" ? <p className="mt-2 text-sm text-amber-800">Archived source</p> : null}
          {updated ? <p className="mt-2 text-sm text-sky-700">Source updated · Refresh snapshot available</p> : null}
        </li>;
      })}</ol>}
  </section>;
}
