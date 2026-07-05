"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Round } from "@/core/entities/round";
import { RoundService } from "@/core/services/round-service";
import { RoundKnowledgeService } from "@/core/services/round-knowledge-service";
import { AssetService } from "@/core/services/asset-service";
import { BrowserAssetStorage } from "@/infrastructure/storage/browser-asset-storage";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";

type Sort = "order" | "updated" | "knowledge";

function short(value: string, length = 96) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length)}…` : normalized || "—";
}

export function ConversationWorkspaceMode({ conversationId, onAnalyzeRound }: { conversationId: string; onAnalyzeRound: (round: Round) => Promise<void> }) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("order");
  const [recent, setRecent] = useState<ReturnType<BrowserConversationStorage["getAll"]>>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [draftSummaries, setDraftSummaries] = useState<Record<string, string>>({});

  const reload = useCallback(() => {
    const nextRounds = new BrowserRoundStorage().getByConversationId(conversationId);
    setRounds(nextRounds);
    setDraftNotes(Object.fromEntries(nextRounds.map((round) => [round.id, round.note ?? ""])));
    setDraftSummaries(Object.fromEntries(nextRounds.map((round) => [round.id, round.summary ?? ""])));
    setSelectedId((current) => current && nextRounds.some((round) => round.id === current) ? current : nextRounds[0]?.id ?? null);
    setRecent(new BrowserConversationStorage().getAll().sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt)).slice(0, 20));
  }, [conversationId]);

  useEffect(() => {
    const timer = window.setTimeout(reload, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const knowledge = new BrowserKnowledgeCardStorage().getAll();
  const proposals = new BrowserProposalStorage().getAll();
  const assets = new BrowserAssetStorage().getAll();
  const selected = rounds.find((round) => round.id === selectedId) ?? null;
  const visible = useMemo(() => rounds
    .filter((round) => `${round.title} ${round.question} ${round.answer} ${round.note ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => sort === "updated" ? right.updatedAt.localeCompare(left.updatedAt) : sort === "knowledge" ? knowledge.filter((card) => card.sourceRoundId === right.id).length - knowledge.filter((card) => card.sourceRoundId === left.id).length : left.order - right.order), [knowledge, query, rounds, sort]);

  function saveNote() {
    if (!selected) return;
    new RoundService(new BrowserRoundStorage()).updateRound(selected.id, { note: draftNotes[selected.id] ?? "" });
    reload();
  }

  function saveSummary() {
    if (!selected) return;
    new RoundService(new BrowserRoundStorage()).updateRound(selected.id, { summary: draftSummaries[selected.id] ?? "" });
    reload();
  }

  function knowledgeService() {
    return new RoundKnowledgeService(new BrowserKnowledgeCardStorage(), new BrowserProposalStorage());
  }

  function createManualKnowledge() {
    if (!selected) return;
    const title = window.prompt("知识标题", selected.title)?.trim();
    if (!title) return;
    const content = window.prompt("知识内容", selected.summary || selected.answer)?.trim();
    if (!content) return;
    knowledgeService().createManual(selected, title, content);
    reload();
  }

  function createUpdateDraft() {
    if (!selected) return;
    const linked = new BrowserKnowledgeCardStorage().getAll().filter((card) => card.sourceRoundId === selected.id);
    if (!linked.length) return;
    const target = linked.length === 1 ? linked[0] : linked.find((card) => card.id === window.prompt(`输入要更新的 Knowledge ID：\n${linked.map((card) => `${card.id} · ${card.title}`).join("\n")}`));
    if (!target) return;
    const proposal = knowledgeService().createUpdateDraft(selected, target);
    window.location.href = `/review?proposal=${encodeURIComponent(proposal.id)}`;
  }

  function addRoundAsset() {
    if (!selected) return;
    const filename = window.prompt("附件文件名")?.trim();
    if (!filename) return;
    const localPath = window.prompt("本地路径（只记录，不读取文件）") ?? "";
    new AssetService(new BrowserAssetStorage()).addMetadata({ entityType: "round", entityId: selected.id, filename, localPath });
    reload();
  }

  function exportRound() {
    if (!selected) return;
    const content = `# ${selected.title}\n\n## Question\n\n${selected.question}\n\n## Answer\n\n${selected.answer}\n\n## Summary\n\n${selected.summary ?? ""}`;
    const blob = new Blob([content], { type: "text/markdown" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${selected.title}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <><div className="mt-8 text-right"><button className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40" disabled={!selected} onClick={exportRound} type="button">Export selected Round Markdown</button></div><section className="mt-3 grid min-h-[620px] gap-4 xl:grid-cols-[220px_minmax(320px,1fr)_minmax(320px,1fr)]">
    <aside className="rounded-xl border border-zinc-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Recent Conversations</p><div className="mt-3 space-y-1">{recent.map((conversation) => <Link className={`block rounded-lg px-3 py-2 text-sm ${conversation.id === conversationId ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-zinc-50"}`} href={`/conversation/${conversation.id}?mode=workspace`} key={conversation.id} title={short(conversation.note ?? conversation.title, 180)}>{conversation.title}<span className="mt-1 block truncate text-[11px] opacity-70">{short(conversation.note ?? "暂无预览", 54)}</span></Link>)}</div></aside>
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex flex-wrap gap-2"><input className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Round" value={query} /><select className="rounded-lg border border-zinc-200 bg-white px-2 text-sm" onChange={(event) => setSort(event.target.value as Sort)} value={sort}><option value="order">原始顺序</option><option value="updated">最近更新</option><option value="knowledge">Knowledge 数量</option></select></div><ol className="mt-4 space-y-3">{visible.map((round) => {
      const roundProposals = proposals.filter((proposal) => proposal.sourceRoundId === round.id);
      const roundKnowledge = knowledge.filter((card) => card.sourceRoundId === round.id);
      const roundAssets = assets.filter((asset) => asset.entityType === "round" && asset.entityId === round.id);
      return <li key={round.id}><button className={`w-full rounded-xl border p-4 text-left ${selectedId === round.id ? "border-zinc-950 bg-white shadow-sm" : "border-zinc-200 bg-white/70"}`} onClick={() => setSelectedId(round.id)} type="button"><p className="text-xs font-semibold text-zinc-500">Round {round.order} · {new Date(round.updatedAt).toLocaleDateString("zh-CN")}</p><h3 className="mt-1 font-semibold">{round.title}</h3><p className="mt-2 text-sm text-sky-900">Q: {short(round.question)}</p><p className="mt-1 text-sm text-violet-900">A: {short(round.answer)}</p><p className="mt-3 text-xs text-zinc-500">{round.note ? "● Note" : "○ Note"} · {round.summary ? "● Summary" : "○ Summary"} · {roundProposals.length} 建议 · {roundKnowledge.length} 知识 · {roundAssets.length} 附件</p></button></li>;
    })}</ol></div>
    <aside className="rounded-xl border border-zinc-200 bg-white p-5">{selected ? <><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Round Workspace Panel</p><h2 className="mt-2 text-xl font-semibold">{selected.title}</h2><label className="mt-5 block text-sm font-semibold">Round Note<textarea className="mt-2 min-h-24 w-full rounded-lg border border-zinc-200 p-3 text-sm" onChange={(event) => setDraftNotes((current) => ({ ...current, [selected.id]: event.target.value }))} value={draftNotes[selected.id] ?? ""} /></label><button className="mt-2 rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white" onClick={saveNote} type="button">保存 Note</button>
      <div className="mt-5 rounded-lg bg-zinc-50 p-4"><label className="text-sm font-semibold">Round Summary<textarea className="mt-2 min-h-24 w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm font-normal" onChange={(event) => setDraftSummaries((current) => ({ ...current, [selected.id]: event.target.value }))} placeholder="手动总结本轮；Analyzer 只生成 Proposal 草稿，不自动覆盖。" value={draftSummaries[selected.id] ?? ""} /></label><button className="mt-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold" onClick={saveSummary} type="button">确认保存 Summary</button></div>
      <div className="mt-5 grid gap-3 text-sm"><div><p className="font-semibold">Linked Proposal</p>{proposals.filter((proposal) => proposal.sourceRoundId === selected.id).map((proposal) => <Link className="mt-1 block text-sky-700" href={`/review?proposal=${proposal.id}`} key={proposal.id}>{proposal.title}</Link>)}</div><div><p className="font-semibold">Linked Knowledge</p>{knowledge.filter((card) => card.sourceRoundId === selected.id).map((card) => <Link className="mt-1 block text-emerald-700" href={`/knowledge/${card.id}`} key={card.id}>{card.title}</Link>)}</div><div><div className="flex items-center justify-between"><p className="font-semibold">Linked Assets</p><button className="text-xs text-sky-700" onClick={addRoundAsset} type="button">添加</button></div>{assets.filter((asset) => asset.entityType === "round" && asset.entityId === selected.id).map((asset) => <p className="mt-1 text-xs text-zinc-600" key={asset.id}>{asset.filename} · {asset.status ?? "unknown"} · {asset.localPath ?? "无路径"}</p>)}</div></div>
      <div className="mt-6 grid gap-2"><button className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={analyzing} onClick={async () => { setAnalyzing(true); try { await onAnalyzeRound(selected); } finally { setAnalyzing(false); } }} type="button">{analyzing ? "Analyzing…" : "Analyze This Round / 生成 Summary Proposal"}</button><p className="text-xs text-zinc-500">生成的是待确认草稿，不会覆盖现有 Summary，也不会直接写入 Knowledge。</p><button className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold" onClick={createManualKnowledge} type="button">Create Knowledge manually</button><button className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-40" disabled={!knowledge.some((card) => card.sourceRoundId === selected.id)} onClick={createUpdateDraft} type="button">Update Knowledge Draft</button></div></> : <p className="text-sm text-zinc-500">选择一个 Round 开始整理。</p>}</aside>
  </section></>;
}
