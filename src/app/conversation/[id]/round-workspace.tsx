"use client";

import { useEffect, useMemo, useState } from "react";
import type { Round } from "@/core/entities/round";
import { RoundService } from "@/core/services/round-service";
import { createRoundStorage, createConversationStorage, createMessageStorage } from "@/infrastructure/storage/storage-factory";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { MessageToRoundMigrationService } from "@/core/services/message-to-round-migration";
import { BrowserConversationVersionStorage } from "@/infrastructure/storage/browser-conversation-version-storage";
import { ConversationVersionService } from "@/core/services/conversation-version-service";
import { BrowserAppEventLogStorage } from "@/infrastructure/storage/browser-feedback-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserAssetStorage } from "@/infrastructure/storage/browser-asset-storage";
import { AssetService } from "@/core/services/asset-service";
import { RoundKnowledgeService } from "@/core/services/round-knowledge-service";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";
import type { Asset } from "@/core/entities/asset";

type RoundWorkspaceProps = {
  conversationId: string;
  onAnalyzeRound?: (round: Round) => Promise<void>;
};

function createService() {
  return new RoundService(createRoundStorage());
}

export function RoundWorkspace({ conversationId, onAnalyzeRound }: RoundWorkspaceProps) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [query, setQuery] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [messageIdsDraft, setMessageIdsDraft] = useState("");
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [knowledgeCounts, setKnowledgeCounts] = useState<Map<string, number>>(new Map());
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);
  const [autoSnapshotNotice, setAutoSnapshotNotice] = useState<string | null>(null);
  const [inspectedRoundId, setInspectedRoundId] = useState<string | null>(null);
  const [allProposals, setAllProposals] = useState<Proposal[]>([]);
  const [allKnowledge, setAllKnowledge] = useState<KnowledgeCard[]>([]);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [inspectorSummaryDraft, setInspectorSummaryDraft] = useState("");

  // K4: batch select
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRounds(createService().listByConversation(conversationId));
      const counts = new Map<string, number>();
      new BrowserKnowledgeCardStorage().getAll().forEach((card) => {
        if (card.sourceRoundId) counts.set(card.sourceRoundId, (counts.get(card.sourceRoundId) ?? 0) + 1);
      });
      setKnowledgeCounts(counts);
      setAllProposals(new BrowserProposalStorage().getAll());
      setAllKnowledge(new BrowserKnowledgeCardStorage().getAll());
      setAllAssets(new BrowserAssetStorage().getAll());
      const requestedRoundId = new URLSearchParams(window.location.search).get("round");
      if (requestedRoundId) {
        window.requestAnimationFrame(() => {
          document.getElementById(`round-${requestedRoundId}`)?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversationId]);

  const visibleRounds = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return rounds;
    return rounds.filter((round) =>
      [round.title, round.question, round.answer, round.note ?? ""]
        .join("\n")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, rounds]);

  function reload() {
    setRounds(createService().listByConversation(conversationId));
  }

  function createAutoSnapshot(label: string) {
    try {
      new ConversationVersionService({
        conversations: createConversationStorage(),
        messages: createMessageStorage(),
        versions: new BrowserConversationVersionStorage(),
      }).createSnapshot(conversationId, `自动恢复点 — ${label}`, `执行「${label}」操作前自动创建`);
      setAutoSnapshotNotice("已创建恢复点，可在版本恢复中撤回。");
    } catch {
      // snapshot creation is best-effort; don't block the operation
    }
  }

  function addRound() {
    const round = createService().createRound({
      conversationId,
      title: `Round ${rounds.length + 1}`,
      question: "",
      answer: "",
      messageIds: [],
    });
    new BrowserAppEventLogStorage().record("round created", round.id, conversationId);
    reload();
    startEditing(round);
  }

  function startEditing(round: Round) {
    setEditingId(round.id);
    setQuestionDraft(round.question);
    setAnswerDraft(round.answer);
    setNoteDraft(round.note ?? "");
    setMessageIdsDraft(round.messageIds.join(", "));
    setCollapsedIds((current) => {
      const next = new Set(current);
      next.delete(round.id);
      return next;
    });
  }

  function saveRound(roundId: string) {
    const service = createService();
    service.updateRound(roundId, {
      question: questionDraft,
      answer: answerDraft,
      note: noteDraft,
    });
    service.rebindMessageIds(
      roundId,
      messageIdsDraft.split(",").map((messageId) => messageId.trim()).filter(Boolean),
    );
    setEditingId(null);
    reload();
  }

  function toggleCollapsed(roundId: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(roundId)) next.delete(roundId);
      else next.add(roundId);
      return next;
    });
  }

  function deleteRound(round: Round) {
    if (!window.confirm(`删除「${round.title}」？Messages 不会被删除。`)) return;
    createAutoSnapshot(`删除 Round「${round.title}」`);
    createService().deleteRound(round.id);
    reload();
  }

  function renameRound(round: Round) {
    const newTitle = window.prompt("重命名 Round", round.title)?.trim();
    if (!newTitle || newTitle === round.title) return;
    createService().updateRound(round.id, { title: newTitle });
    reload();
  }

  function duplicateRound(round: Round) {
    createAutoSnapshot(`复制 Round「${round.title}」`);
    const service = createService();
    const newRound = service.createRound({
      conversationId: round.conversationId,
      title: `${round.title} (copy)`,
      question: round.question,
      answer: round.answer,
      messageIds: [...round.messageIds],
      note: round.note,
      order: round.order + 1,
    });
    if (round.summary) service.updateRound(newRound.id, { summary: round.summary });
    reload();
  }

  // K4: Batch operations
  function toggleBatchMode() {
    setBatchMode((prev) => !prev);
    setBatchSelectedIds(new Set());
  }

  function toggleBatchSelect(roundId: string) {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(roundId)) next.delete(roundId);
      else next.add(roundId);
      return next;
    });
  }

  function batchDelete() {
    if (batchSelectedIds.size === 0) return;
    if (!window.confirm(`删除 ${batchSelectedIds.size} 个选中的 Round？Messages 不会被删除。`)) return;
    createAutoSnapshot(`批量删除 ${batchSelectedIds.size} 个 Round`);
    const service = createService();
    batchSelectedIds.forEach((id) => service.deleteRound(id));
    setBatchSelectedIds(new Set());
    setBatchMode(false);
    reload();
  }

  function batchMoveUp() {
    if (batchSelectedIds.size === 0) return;
    createAutoSnapshot(`批量上移 ${batchSelectedIds.size} 个 Round`);
    const service = createService();
    const selected = rounds.filter((r) => batchSelectedIds.has(r.id)).sort((a, b) => a.order - b.order);
    for (const round of selected) {
      if (round.order > 1) service.reorderRound(round.id, round.order - 1);
    }
    reload();
  }

  function batchMoveDown() {
    if (batchSelectedIds.size === 0) return;
    createAutoSnapshot(`批量下移 ${batchSelectedIds.size} 个 Round`);
    const service = createService();
    const selected = rounds.filter((r) => batchSelectedIds.has(r.id)).sort((a, b) => b.order - a.order);
    for (const round of selected) {
      if (round.order < rounds.length) service.reorderRound(round.id, round.order + 1);
    }
    reload();
  }

  // K2: Proposal workflow helpers
  function proposalInsertSummary(proposal: Proposal) {
    if (!inspectedRoundId) return;
    const current = inspectorSummaryDraft;
    setInspectorSummaryDraft(current ? `${current}\n\n${proposal.title}` : proposal.title);
  }

  function proposalInsertBelow(proposal: Proposal) {
    if (!inspectedRoundId) return;
    const current = inspectorSummaryDraft;
    setInspectorSummaryDraft(`${proposal.title}\n\n${current}`.trim());
  }

  function proposalReplace(proposal: Proposal) {
    if (!inspectedRoundId) return;
    if (!window.confirm("用 Proposal 替换当前 Summary？当前 Summary 内容将被覆盖。")) return;
    setInspectorSummaryDraft(proposal.title);
  }

  function proposalCopy(proposal: Proposal) {
    navigator.clipboard.writeText(proposal.title).then(() => {
      alert("Proposal 内容已复制到剪贴板。");
    }).catch(() => {
      window.prompt("按 Ctrl+C 复制:", proposal.title);
    });
  }

  function proposalDismiss(proposal: Proposal) {
    if (!window.confirm(`Dismiss Proposal「${proposal.title}」？此操作不可撤销。`)) return;
    new BrowserProposalStorage().remove(proposal.id);
    setAllProposals((prev) => prev.filter((p) => p.id !== proposal.id));
  }

  function mergeWithPrevious(round: Round) {
    const previous = rounds.find((candidate) => candidate.order === round.order - 1);
    if (!previous) return;
    createAutoSnapshot(`合并 Round「${previous.title}」+「${round.title}」`);
    createService().mergeRounds(previous.id, round.id);
    reload();
  }

  function splitRound(round: Round) {
    createAutoSnapshot(`拆分 Round「${round.title}」`);
    createService().splitRound(round.id);
    reload();
  }

  function moveRound(round: Round, direction: -1 | 1) {
    createAutoSnapshot(`移动 Round「${round.title}」`);
    createService().reorderRound(round.id, round.order + direction);
    reload();
  }

  async function analyzeRound(round: Round) {
    if (!onAnalyzeRound) return;
    setAnalyzingId(round.id);
    try {
      await onAnalyzeRound(round);
    } finally {
      setAnalyzingId(null);
    }
  }

  function generateFromLegacyMessages() {
    const migration = new MessageToRoundMigrationService(
      createConversationStorage(),
      createMessageStorage(),
      createRoundStorage(),
    );
    const preview = migration.previewConversation(conversationId);
    if (preview.summary.status === "blocked") {
      setMigrationNotice(preview.summary.errors.join(" "));
      return;
    }
    if (preview.summary.status === "noop") {
      setMigrationNotice("没有需要生成的 Round；旧 Messages 保持不变。");
      return;
    }
    if (!window.confirm(`将从 ${preview.summary.messageCount} 条旧 Messages 生成 ${preview.summary.roundsToCreateCount} 个 Rounds。Messages 不会删除或改写，继续吗？`)) return;
    migration.applyConversation(preview);
    setMigrationNotice(`已生成 ${preview.summary.roundsToCreateCount} 个 Rounds；旧 Messages 保持不变。`);
    reload();
  }

  function inspectRound(round: Round) {
    setInspectedRoundId(round.id);
    setInspectorSummaryDraft(round.summary ?? "");
  }

  function navigateInspector(direction: -1 | 1) {
    if (!inspectedRoundId) return;
    const currentIndex = rounds.findIndex((round) => round.id === inspectedRoundId);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= rounds.length) return;
    inspectRound(rounds[nextIndex]);
  }

  function saveInspectorSummary() {
    if (!inspectedRoundId) return;
    createService().updateRound(inspectedRoundId, { summary: inspectorSummaryDraft });
    reload();
  }

  function createKnowledgeFromInspector() {
    if (!inspectedRoundId) return;
    const round = rounds.find((r) => r.id === inspectedRoundId);
    if (!round) return;
    const title = window.prompt("知识标题", round.title)?.trim();
    if (!title) return;
    const content = window.prompt("知识内容", round.summary || round.answer)?.trim();
    if (!content) return;
    new RoundKnowledgeService(new BrowserKnowledgeCardStorage(), new BrowserProposalStorage()).createManual(round, title, content);
    reload();
  }

  function addInspectorAsset() {
    if (!inspectedRoundId) return;
    const filename = window.prompt("附件文件名")?.trim();
    if (!filename) return;
    const localPath = window.prompt("本地路径（只记录，不读取文件）") ?? "";
    new AssetService(new BrowserAssetStorage()).addMetadata({ entityType: "round", entityId: inspectedRoundId, filename, localPath });
    reload();
  }

  async function analyzeInspectorRound() {
    if (!inspectedRoundId || !onAnalyzeRound) return;
    const round = rounds.find((r) => r.id === inspectedRoundId);
    if (!round) return;
    setAnalyzingId(round.id);
    try { await onAnalyzeRound(round); } finally { setAnalyzingId(null); }
  }

  return (
    <section className="detail-section">
      <div className="detail-section-heading">
        <p className="detail-kicker">05 · Rounds</p>
        <h2 className="detail-title">Conversation Rounds</h2>
        <p className="detail-description">默认阅读层；Message Timeline 作为底层数据保留。</p>
      </div>
      <div className={inspectedRoundId ? "grid gap-6 lg:grid-cols-[1fr_320px]" : ""}>
        <div>
        <div className="sticky top-0 z-10 bg-zinc-50/95 pb-3 flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 text-xs font-medium text-zinc-600">
            Search Rounds
            <input className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="搜索 question、answer 或 note" type="search" value={query} />
          </label>
          <button className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white" onClick={addRound} type="button">新增 Round</button>
          <button className={`rounded-lg border px-3 py-2 text-xs font-semibold ${batchMode ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-600"}`} onClick={toggleBatchMode} type="button">{batchMode ? "退出批量" : "Batch Select"}</button>
          {batchMode ? (
            <div className="flex gap-2">
              <button className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-30" disabled={batchSelectedIds.size === 0} onClick={batchDelete} type="button">删除选中 ({batchSelectedIds.size})</button>
              <button className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-30" disabled={batchSelectedIds.size === 0} onClick={batchMoveUp} type="button">↑ 上移</button>
              <button className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-30" disabled={batchSelectedIds.size === 0} onClick={batchMoveDown} type="button">↓ 下移</button>
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-zinc-500">显示 {visibleRounds.length} / {rounds.length} 个 Round</p>
        <ol className="mt-4 space-y-4">
          {visibleRounds.map((round) => {
            const collapsed = collapsedIds.has(round.id);
            const editing = editingId === round.id;
            return (
              <li className={`scroll-mt-8 rounded-xl border bg-white p-5 ${batchSelectedIds.has(round.id) ? "border-zinc-950 ring-2 ring-zinc-200" : "border-zinc-200"}`} id={`round-${round.id}`} key={round.id}>
                {batchMode ? (
                  <label className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-600">
                    <input
                      checked={batchSelectedIds.has(round.id)}
                      className="size-4 accent-zinc-950"
                      onChange={() => toggleBatchSelect(round.id)}
                      type="checkbox"
                    />
                    选择 Round {round.order}
                  </label>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Round {round.order} · {round.messageIds.length} Messages · {knowledgeCounts.get(round.id) ?? 0} Knowledge</p>
                    <h3 className="mt-1 font-semibold text-zinc-950">{round.title}</h3>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs font-medium">
                    <button className="text-emerald-700 hover:text-emerald-900 disabled:opacity-40" disabled={analyzingId !== null || (!round.question && !round.answer && round.messageIds.length === 0)} onClick={() => analyzeRound(round)} type="button">{analyzingId === round.id ? "Analyzing…" : "可选：生成 AI 整理建议"}</button>
                    <button className="text-zinc-600 hover:text-zinc-950 disabled:opacity-30" disabled={round.order === 1} onClick={() => moveRound(round, -1)} type="button">上移</button>
                    <button className="text-zinc-600 hover:text-zinc-950 disabled:opacity-30" disabled={round.order === rounds.length} onClick={() => moveRound(round, 1)} type="button">下移</button>
                    <button className="text-zinc-600 hover:text-zinc-950 disabled:opacity-30" disabled={round.order === 1} onClick={() => mergeWithPrevious(round)} type="button">合并上一 Round</button>
                    <button className="text-zinc-600 hover:text-zinc-950" onClick={() => splitRound(round)} type="button">拆分</button>
                    <button className="text-zinc-600 hover:text-zinc-950" onClick={() => renameRound(round)} type="button">Rename</button>
                    <button className="text-zinc-600 hover:text-zinc-950" onClick={() => duplicateRound(round)} type="button">Duplicate</button>
                    <button className="text-zinc-600 hover:text-zinc-950" onClick={() => startEditing(round)} type="button">Edit</button>
                    <button className="text-red-600 hover:text-red-800" onClick={() => deleteRound(round)} type="button">删除</button>
                    <button className={`text-sm font-semibold ${inspectedRoundId === round.id ? "text-zinc-950" : "text-sky-600 hover:text-sky-800"}`} onClick={() => inspectRound(round)} type="button">{inspectedRoundId === round.id ? "正在查看" : "Inspect"}</button>
                    <button aria-expanded={!collapsed} className="text-zinc-600 hover:text-zinc-950" onClick={() => toggleCollapsed(round.id)} type="button">{collapsed ? "展开" : "折叠"}</button>
                  </div>
                </div>
                {collapsed ? (
                  <p className="mt-3 truncate text-sm text-zinc-500">
                    {round.question || round.answer || "空 Round"}
                    {round.note ? " · ● Note" : ""}
                  </p>
                ) : editing ? (
                  <div className="mt-4 space-y-3">
                    <label className="block text-xs font-medium text-zinc-600">Question<textarea className="mt-1.5 min-h-24 w-full rounded-lg border border-zinc-200 p-3 text-sm" onChange={(event) => setQuestionDraft(event.target.value)} value={questionDraft} /></label>
                    <label className="block text-xs font-medium text-zinc-600">Answer<textarea className="mt-1.5 min-h-32 w-full rounded-lg border border-zinc-200 p-3 text-sm" onChange={(event) => setAnswerDraft(event.target.value)} value={answerDraft} /></label>
                    <label className="block text-xs font-medium text-zinc-600">我的备注<textarea className="mt-1.5 min-h-20 w-full rounded-lg border border-zinc-200 p-3 text-sm" onChange={(event) => setNoteDraft(event.target.value)} value={noteDraft} /></label>
                    <label className="block text-xs font-medium text-zinc-600">Message IDs（逗号分隔；保存时会从其他 Round 解除重复绑定）<textarea className="mt-1.5 min-h-20 w-full rounded-lg border border-zinc-200 p-3 font-mono text-xs" onChange={(event) => setMessageIdsDraft(event.target.value)} value={messageIdsDraft} /></label>
                    <div className="flex justify-end gap-2">
                      <button className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium" onClick={() => setEditingId(null)} type="button">Cancel</button>
                      <button className="rounded-md bg-zinc-950 px-3 py-2 text-xs font-medium text-white" onClick={() => saveRound(round.id)} type="button">Save Round</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg bg-sky-50 p-4"><p className="text-xs font-semibold text-sky-800">Question</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-sky-950">{round.question || "（无问题）"}</p></div>
                    <div className="rounded-lg bg-violet-50 p-4"><p className="text-xs font-semibold text-violet-800">Answer</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-violet-950">{round.answer || "（无回答）"}</p></div>
                    {round.note ? <div className="rounded-lg bg-amber-50 p-4 md:col-span-2"><p className="text-xs font-semibold text-amber-800">我的备注</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">{round.note}</p></div> : <div className="rounded-lg bg-amber-50/50 p-4 md:col-span-2"><p className="text-xs font-semibold text-amber-800">我的备注</p><p className="mt-2 text-sm leading-6 text-amber-700">暂无备注。</p></div>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {rounds.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500"><p>这个 Conversation 尚无 Round；旧 Messages 仍可用。</p><button className="mt-3 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800" onClick={generateFromLegacyMessages} type="button">从旧 Messages 预检并生成 Rounds</button></div> : null}
        {autoSnapshotNotice ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status"><p className="font-semibold">✅ {autoSnapshotNotice}</p><p className="mt-1 text-xs text-emerald-700">可在下方「版本恢复」区域撤回到操作前的状态。</p></div> : null}
        {migrationNotice ? <p className="mt-3 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800" role="status">{migrationNotice}</p> : null}
        </div>
        {inspectedRoundId ? (() => {
          const inspected = rounds.find((r) => r.id === inspectedRoundId);
          if (!inspected) return null;
          const roundProposals = allProposals.filter((p) => p.sourceRoundId === inspectedRoundId);
          const roundKnowledge = allKnowledge.filter((k) => k.sourceRoundId === inspectedRoundId);
          const roundAssets = allAssets.filter((a) => a.entityType === "round" && a.entityId === inspectedRoundId);
          const currentIndex = rounds.findIndex((r) => r.id === inspectedRoundId);
          return (
            <aside className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Round Inspector</p>
                <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950" onClick={() => setInspectedRoundId(null)} type="button">✕ 关闭 Inspector</button>
              </div>
              <h2 className="mt-2 text-lg font-semibold text-zinc-950">{inspected.title}</h2>
              <div className="mt-3 flex items-center gap-2">
                <button className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-30" disabled={currentIndex <= 0} onClick={() => navigateInspector(-1)} type="button">← 上一 Round</button>
                <button className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-30" disabled={currentIndex >= rounds.length - 1} onClick={() => navigateInspector(1)} type="button">下一 Round →</button>
                <span className="text-[10px] text-zinc-400">{currentIndex + 1} / {rounds.length}</span>
              </div>

              {/* Round Note is always visible in the Round card above — not duplicated in Inspector */}

              <label className="mt-5 block text-sm font-semibold text-zinc-700">本轮摘要<span className="ml-2 text-xs font-normal text-zinc-400">这一轮客观说了什么</span><textarea className="mt-2 min-h-20 w-full rounded-lg border border-zinc-200 p-3 text-sm font-normal" onChange={(event) => setInspectorSummaryDraft(event.target.value)} placeholder="这一轮客观说了什么…" value={inspectorSummaryDraft} /></label>
              <button className="mt-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold" onClick={saveInspectorSummary} type="button">确认保存摘要</button>

              <div className="mt-5 space-y-3 border-t border-zinc-100 pt-5 text-sm">
                {roundProposals.length > 0 ? (
                <div>
                  <p className="font-semibold text-zinc-700">Proposal / AI 整理建议</p>
                  {roundProposals.map((p) => (
                    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-3" key={p.id}>
                      <p className="text-xs text-sky-800 mb-2">AI 建议：{p.title}</p>
                      <div className="flex flex-wrap gap-1">
                        <button className="rounded border border-sky-300 bg-white px-2 py-1 text-[10px] font-medium text-sky-700 hover:bg-sky-100" onClick={() => proposalInsertSummary(p)} type="button" title="追加到 Summary 末尾">Insert ↓</button>
                        <button className="rounded border border-sky-300 bg-white px-2 py-1 text-[10px] font-medium text-sky-700 hover:bg-sky-100" onClick={() => proposalInsertBelow(p)} type="button" title="插入到 Summary 开头">Insert ↑</button>
                        <button className="rounded border border-amber-300 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100" onClick={() => proposalReplace(p)} type="button" title="用 Proposal 替换当前 Summary">Replace</button>
                        <button className="rounded border border-zinc-300 bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-100" onClick={() => proposalCopy(p)} type="button" title="复制 Proposal 到剪贴板">Copy</button>
                        <button className="rounded border border-red-200 bg-white px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50" onClick={() => proposalDismiss(p)} type="button" title="删除此 Proposal">Dismiss</button>
                      </div>
                    </div>
                  ))}
                </div>
                ) : null}
                <div>
                  <p className="font-semibold text-zinc-700">Knowledge / 已确认知识</p>
                  {roundKnowledge.length > 0 ? roundKnowledge.map((k) => <a className="mt-1 block text-emerald-700 underline" href={`/knowledge/${k.id}`} key={k.id}>{k.title}</a>) : <p className="mt-1 text-xs text-zinc-400">暂无已确认知识</p>}
                </div>
                <div>
                  <div className="flex items-center justify-between"><p className="font-semibold text-zinc-700">Assets</p><button className="text-xs text-sky-600 hover:text-sky-800" onClick={addInspectorAsset} type="button">+ 添加</button></div>
                  {roundAssets.length > 0 ? roundAssets.map((a) => <p className="mt-1 text-xs text-zinc-500" key={a.id}>{a.filename} · {a.status ?? "unknown"}{a.localPath ? ` · ${a.localPath}` : ""}</p>) : <p className="mt-1 text-xs text-zinc-400">暂无附件</p>}
                </div>
              </div>

              <div className="mt-5 space-y-2 border-t border-zinc-100 pt-5">
                <button className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={analyzingId === inspected.id || (!inspected.question && !inspected.answer && inspected.messageIds.length === 0)} onClick={analyzeInspectorRound} type="button">{analyzingId === inspected.id ? "Analyzing…" : "可选：生成 AI 整理建议"}</button>
                <p className="text-xs text-zinc-400">不影响原文、Round、Summary；失败也不会丢数据。生成 Proposal 草稿，不覆盖现有 Summary。</p>
                <button className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50" onClick={createKnowledgeFromInspector} type="button">从当前 Round 创建 Knowledge</button>
                <button className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700" onClick={() => setInspectedRoundId(null)} type="button">收起 Inspector</button>
              </div>
            </aside>
          );
        })() : null}
      </div>
    </section>
  );
}
