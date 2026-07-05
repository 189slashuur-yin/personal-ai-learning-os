"use client";

import { useEffect, useMemo, useState } from "react";
import type { Round } from "@/core/entities/round";
import { RoundService } from "@/core/services/round-service";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { MessageToRoundMigrationService } from "@/core/services/message-to-round-migration";

type RoundWorkspaceProps = {
  conversationId: string;
  onAnalyzeRound?: (round: Round) => Promise<void>;
};

function createService() {
  return new RoundService(new BrowserRoundStorage());
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRounds(createService().listByConversation(conversationId));
      const counts = new Map<string, number>();
      new BrowserKnowledgeCardStorage().getAll().forEach((card) => {
        if (card.sourceRoundId) counts.set(card.sourceRoundId, (counts.get(card.sourceRoundId) ?? 0) + 1);
      });
      setKnowledgeCounts(counts);
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

  function addRound() {
    const round = createService().createRound({
      conversationId,
      title: `Round ${rounds.length + 1}`,
      question: "",
      answer: "",
      messageIds: [],
    });
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
    createService().deleteRound(round.id);
    reload();
  }

  function mergeWithPrevious(round: Round) {
    const previous = rounds.find((candidate) => candidate.order === round.order - 1);
    if (!previous) return;
    createService().mergeRounds(previous.id, round.id);
    reload();
  }

  function splitRound(round: Round) {
    createService().splitRound(round.id);
    reload();
  }

  function moveRound(round: Round, direction: -1 | 1) {
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
      new BrowserConversationStorage(),
      new BrowserMessageStorage(),
      new BrowserRoundStorage(),
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

  return (
    <section className="detail-section">
      <div className="detail-section-heading">
        <p className="detail-kicker">05 · Rounds</p>
        <h2 className="detail-title">Conversation Rounds</h2>
        <p className="detail-description">默认阅读层；Message Timeline 作为底层数据保留。</p>
      </div>
      <div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 text-xs font-medium text-zinc-600">
            Search Rounds
            <input className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="搜索 question、answer 或 note" type="search" value={query} />
          </label>
          <button className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white" onClick={addRound} type="button">新增 Round</button>
        </div>
        <p className="mt-3 text-xs text-zinc-500">显示 {visibleRounds.length} / {rounds.length} 个 Round</p>
        <ol className="mt-4 space-y-4">
          {visibleRounds.map((round) => {
            const collapsed = collapsedIds.has(round.id);
            const editing = editingId === round.id;
            return (
              <li className="scroll-mt-8 rounded-xl border border-zinc-200 bg-white p-5" id={`round-${round.id}`} key={round.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Round {round.order} · {round.messageIds.length} Messages · {knowledgeCounts.get(round.id) ?? 0} Knowledge</p>
                    <h3 className="mt-1 font-semibold text-zinc-950">{round.title}</h3>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs font-medium">
                    <button className="text-emerald-700 hover:text-emerald-900 disabled:opacity-40" disabled={analyzingId !== null || (!round.question && !round.answer && round.messageIds.length === 0)} onClick={() => analyzeRound(round)} type="button">{analyzingId === round.id ? "Analyzing…" : "Analyze Round"}</button>
                    <button className="text-zinc-600 hover:text-zinc-950 disabled:opacity-30" disabled={round.order === 1} onClick={() => moveRound(round, -1)} type="button">上移</button>
                    <button className="text-zinc-600 hover:text-zinc-950 disabled:opacity-30" disabled={round.order === rounds.length} onClick={() => moveRound(round, 1)} type="button">下移</button>
                    <button className="text-zinc-600 hover:text-zinc-950 disabled:opacity-30" disabled={round.order === 1} onClick={() => mergeWithPrevious(round)} type="button">合并上一 Round</button>
                    <button className="text-zinc-600 hover:text-zinc-950" onClick={() => splitRound(round)} type="button">拆分</button>
                    <button className="text-zinc-600 hover:text-zinc-950" onClick={() => startEditing(round)} type="button">Edit</button>
                    <button className="text-red-600 hover:text-red-800" onClick={() => deleteRound(round)} type="button">删除</button>
                    <button aria-expanded={!collapsed} className="text-zinc-600 hover:text-zinc-950" onClick={() => toggleCollapsed(round.id)} type="button">{collapsed ? "展开" : "折叠"}</button>
                  </div>
                </div>
                {collapsed ? (
                  <p className="mt-3 truncate text-sm text-zinc-500">{round.question || round.answer || "空 Round"}</p>
                ) : editing ? (
                  <div className="mt-4 space-y-3">
                    <label className="block text-xs font-medium text-zinc-600">Question<textarea className="mt-1.5 min-h-24 w-full rounded-lg border border-zinc-200 p-3 text-sm" onChange={(event) => setQuestionDraft(event.target.value)} value={questionDraft} /></label>
                    <label className="block text-xs font-medium text-zinc-600">Answer<textarea className="mt-1.5 min-h-32 w-full rounded-lg border border-zinc-200 p-3 text-sm" onChange={(event) => setAnswerDraft(event.target.value)} value={answerDraft} /></label>
                    <label className="block text-xs font-medium text-zinc-600">Round Note<textarea className="mt-1.5 min-h-20 w-full rounded-lg border border-zinc-200 p-3 text-sm" onChange={(event) => setNoteDraft(event.target.value)} value={noteDraft} /></label>
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
                    {round.note ? <div className="rounded-lg bg-amber-50 p-4 md:col-span-2"><p className="text-xs font-semibold text-amber-800">Note</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">{round.note}</p></div> : null}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {rounds.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500"><p>这个 Conversation 尚无 Round；旧 Messages 仍可用。</p><button className="mt-3 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800" onClick={generateFromLegacyMessages} type="button">从旧 Messages 预检并生成 Rounds</button></div> : null}
        {migrationNotice ? <p className="mt-3 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800" role="status">{migrationNotice}</p> : null}
      </div>
    </section>
  );
}
