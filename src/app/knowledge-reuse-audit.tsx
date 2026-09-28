import type { KnowledgeReuseAuditItem } from "@/core/entities/knowledge-context-ref";

export function KnowledgeReuseAudit({ items, showUnrecorded = false }: { items: KnowledgeReuseAuditItem[] | undefined; showUnrecorded?: boolean }) {
  if (items === undefined) return showUnrecorded
    ? <p className="mt-2 text-xs text-zinc-500">Referenced Knowledge use was not recorded for this older analysis.</p>
    : null;
  return <section className="mt-3 rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm text-zinc-700">
    <h4 className="font-semibold">Referenced Knowledge used in this analysis · {items.length}</h4>
    {items.length ? <ol className="mt-2 list-inside list-decimal space-y-1">{items.map((item) => <li key={item.knowledgeCardId}>
      {item.titleSnapshot}
      {item.sourceStatus === "snapshot-only" ? " · Source unavailable; saved snapshot used" :
        item.sourceStatus === "archived-warning" ? " · Archived source" :
        item.sourceStatus === "updated" ? " · Source updated; saved snapshot used" : ""}
    </li>)}</ol> : <p className="mt-1 text-xs text-zinc-500">No referenced Knowledge was used.</p>}
  </section>;
}
