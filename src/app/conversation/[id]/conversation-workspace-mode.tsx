"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Round } from "@/core/entities/round";
import { RoundService } from "@/core/services/round-service";
import { RoundKnowledgeService } from "@/core/services/round-knowledge-service";
import { AssetService } from "@/core/services/asset-service";
import {
  beginNoteEditing,
  cancelNoteEditing,
  createNoteEditorState,
  getNoteEditorVisibility,
  saveNoteEditing,
  updateNoteDraft,
} from "@/core/services/note-editing";
import { BrowserAssetStorage } from "@/infrastructure/storage/browser-asset-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { createRoundStorage } from "@/infrastructure/storage/storage-factory";

function short(value: string, length = 96) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length)}…` : normalized || "—";
}

export function ConversationWorkspaceMode({ conversationId, onAnalyzeRound }: { conversationId: string; onAnalyzeRound: (round: Round) => Promise<void> }) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"order" | "updated" | "knowledge">("order");
  const [analyzing, setAnalyzing] = useState(false);
  const [noteEditor, setNoteEditor] = useState(createNoteEditorState());
  const [noteEditorRoundId, setNoteEditorRoundId] = useState<string | null>(
    null,
  );
  const [draftSummaries, setDraftSummaries] = useState<Record<string, string>>({});
  const [showRoundList, setShowRoundList] = useState(true);

  const reload = useCallback(() => {
    const nextRounds = createRoundStorage().getByConversationId(conversationId);
    setRounds(nextRounds);
    setDraftSummaries(Object.fromEntries(nextRounds.map((round) => [round.id, round.summary ?? ""])));
    setSelectedId((current) => current && nextRounds.some((round) => round.id === current) ? current : nextRounds[0]?.id ?? null);
  }, [conversationId]);

  useEffect(() => {
    const timer = window.setTimeout(reload, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const knowledge = new BrowserKnowledgeCardStorage().getAll();
  const proposals = new BrowserProposalStorage().getAll();
  const assets = new BrowserAssetStorage().getAll();
  const selected = rounds.find((round) => round.id === selectedId) ?? null;
  const activeNoteEditor =
    selected && noteEditorRoundId === selected.id
      ? noteEditor
      : createNoteEditorState(selected?.note ?? "");
  const noteVisibility = getNoteEditorVisibility(activeNoteEditor.mode);
  const visible = useMemo(() => rounds
    .filter((round) => `${round.title} ${round.question} ${round.answer} ${round.note ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => sort === "updated" ? right.updatedAt.localeCompare(left.updatedAt) : sort === "knowledge" ? knowledge.filter((card) => card.sourceRoundId === right.id).length - knowledge.filter((card) => card.sourceRoundId === left.id).length : left.order - right.order), [knowledge, query, rounds, sort]);

  function saveNote() {
    if (!selected) return;
    const next = saveNoteEditing(activeNoteEditor);
    new RoundService(createRoundStorage()).updateRound(selected.id, {
      note: next.savedValue,
    });
    setNoteEditorRoundId(selected.id);
    setNoteEditor(next);
    reload();
  }

  function startNoteEditing() {
    if (!selected) return;
    setNoteEditorRoundId(selected.id);
    setNoteEditor(
      beginNoteEditing(createNoteEditorState(selected.note ?? "")),
    );
  }

  function cancelActiveNoteEditing() {
    setNoteEditor(cancelNoteEditing(activeNoteEditor));
    setNoteEditorRoundId(null);
  }

  function saveSummary() {
    if (!selected) return;
    new RoundService(createRoundStorage()).updateRound(selected.id, { summary: draftSummaries[selected.id] ?? "" });
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

  return (
    <div className="mt-3 grid min-h-[620px] gap-4 xl:grid-cols-[1fr_320px]">
      {/* Middle: Selected Round content or Round list */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        {selected && !showRoundList ? (
          /* Focused round view */
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Round {selected.order} · {selected.messageIds.length} Messages
              </p>
              <div className="flex gap-2">
                <button className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50" onClick={() => setShowRoundList(true)} type="button">← 返回列表</button>
                <button className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold" onClick={exportRound} type="button">Export</button>
              </div>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">{selected.title}</h2>

            {/* Question */}
            <div className="mt-5 rounded-lg bg-sky-50 p-4">
              <p className="text-xs font-semibold text-sky-800">Question</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-sky-950">{selected.question || "（无问题）"}</p>
            </div>

            {/* Answer */}
            <div className="mt-4 rounded-lg bg-violet-50 p-4">
              <p className="text-xs font-semibold text-violet-800">Answer</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-violet-950">{selected.answer || "（无回答）"}</p>
            </div>

            {/* Summary */}
            {selected.summary ? (
              <div className="mt-4 rounded-lg bg-emerald-50 p-4">
                <p className="text-xs font-semibold text-emerald-800">Summary</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950">{selected.summary}</p>
              </div>
            ) : null}

            {/* Round Note — preview and editor are mutually exclusive. */}
            <div className="mt-4 rounded-lg bg-amber-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-amber-800">Round Note</p>
                {noteVisibility.showPreview ? (
                  <button
                    className="text-xs font-semibold text-amber-800 hover:text-amber-950"
                    onClick={startNoteEditing}
                    type="button"
                  >
                    编辑备注
                  </button>
                ) : null}
              </div>
              {noteVisibility.showEditor ? (
                <div className="mt-3">
                  <textarea
                    aria-label="Round Note"
                    autoFocus
                    className="min-h-24 w-full rounded-lg border border-amber-200 bg-white p-3 text-sm"
                    onChange={(event) =>
                      setNoteEditor(
                        updateNoteDraft(activeNoteEditor, event.target.value),
                      )
                    }
                    value={activeNoteEditor.draftValue}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white"
                      onClick={saveNote}
                      type="button"
                    >
                      保存
                    </button>
                    <button
                      className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-900"
                      onClick={cancelActiveNoteEditing}
                      type="button"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">
                  {activeNoteEditor.savedValue || "暂无备注。"}
                </p>
              )}
            </div>

            {/* Round navigation */}
            <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4">
              <button
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-30"
                disabled={!rounds.some((r) => r.order === selected.order - 1)}
                onClick={() => { const prev = rounds.find((r) => r.order === selected.order - 1); if (prev) setSelectedId(prev.id); }}
                type="button"
              >
                ← 上一 Round
              </button>
              <span className="text-xs text-zinc-400">{selected.order} / {rounds.length}</span>
              <button
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-30"
                disabled={!rounds.some((r) => r.order === selected.order + 1)}
                onClick={() => { const next = rounds.find((r) => r.order === selected.order + 1); if (next) setSelectedId(next.id); }}
                type="button"
              >
                下一 Round →
              </button>
            </div>
          </div>
        ) : (
          /* Round list view */
          <div>
            <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-4 rounded-t-xl border-b border-zinc-200 bg-white px-5 pt-5 pb-3">
              <input className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Round" value={query} />
              <select className="rounded-lg border border-zinc-200 bg-white px-2 text-sm" onChange={(event) => setSort(event.target.value as "order" | "updated" | "knowledge")} value={sort}>
                <option value="order">原始顺序</option>
                <option value="updated">最近更新</option>
                <option value="knowledge">Knowledge 数量</option>
              </select>
            </div>
            <ol className="mt-4 space-y-3">
              {visible.map((round) => {
                const roundProposals = proposals.filter((proposal) => proposal.sourceRoundId === round.id);
                const roundKnowledge = knowledge.filter((card) => card.sourceRoundId === round.id);
                const roundAssets = assets.filter((asset) => asset.entityType === "round" && asset.entityId === round.id);
                return (
                  <li id={`round-${round.id}`} key={round.id}>
                    <button
                      className={`w-full scroll-mt-8 rounded-xl border p-4 text-left ${selectedId === round.id ? "border-zinc-950 bg-white shadow-sm" : "border-zinc-200 bg-white/70"}`}
                      onClick={() => { setSelectedId(round.id); setShowRoundList(false); }}
                      type="button"
                    >
                      <p className="text-xs font-semibold text-zinc-500">Round {round.order} · {new Date(round.updatedAt).toLocaleDateString("zh-CN")}</p>
                      <h3 className="mt-1 font-semibold">{round.title}</h3>
                      <p className="mt-2 text-sm text-sky-900">Q: {short(round.question)}</p>
                      <p className="mt-1 text-sm text-violet-900">A: {short(round.answer)}</p>
                      <p className="mt-3 text-xs text-zinc-500">
                        {round.note ? "● Note" : "○ Note"} · {round.summary ? "● Summary" : "○ Summary"} · {roundProposals.length} 建议 · {roundKnowledge.length} 知识 · {roundAssets.length} 附件
                      </p>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      {/* Right: Round Inspector */}
      <aside className="rounded-xl border border-zinc-200 bg-white p-5">
        {selected ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Round Inspector</p>
            <h2 className="mt-2 text-xl font-semibold">{selected.title}</h2>

            {/* Round Summary */}
            <div className="mt-5 rounded-lg bg-zinc-50 p-4">
              <label className="text-sm font-semibold">
                Round Summary
                <textarea
                  className="mt-2 min-h-24 w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm font-normal"
                  onChange={(event) => setDraftSummaries((current) => ({ ...current, [selected.id]: event.target.value }))}
                  placeholder="手动总结本轮；Analyzer 只生成 Proposal 草稿，不自动覆盖。"
                  value={draftSummaries[selected.id] ?? ""}
                />
              </label>
              <button className="mt-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold" onClick={saveSummary} type="button">确认保存 Summary</button>
            </div>

            {/* Linked content */}
            <div className="mt-5 grid gap-3 text-sm">
              {proposals.some((p) => p.sourceRoundId === selected.id) ? (
              <div>
                <p className="font-semibold">Linked Proposal</p>
                {proposals.filter((proposal) => proposal.sourceRoundId === selected.id).map((proposal) => (
                  <Link className="mt-1 block text-sky-700" href={`/review?proposal=${proposal.id}`} key={proposal.id}>{proposal.title}</Link>
                ))}
              </div>
            ) : null}
              <div>
                <p className="font-semibold">Linked Knowledge</p>
                {knowledge.filter((card) => card.sourceRoundId === selected.id).map((card) => (
                  <Link className="mt-1 block text-emerald-700" href={`/knowledge/${card.id}`} key={card.id}>{card.title}</Link>
                ))}
                {!knowledge.some((k) => k.sourceRoundId === selected.id) ? <p className="mt-1 text-xs text-zinc-400">暂无</p> : null}
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Linked Assets</p>
                  <button className="text-xs text-sky-700" onClick={addRoundAsset} type="button">添加</button>
                </div>
                {assets.filter((asset) => asset.entityType === "round" && asset.entityId === selected.id).map((asset) => (
                  <p className="mt-1 text-xs text-zinc-600" key={asset.id}>{asset.filename} · {asset.status ?? "unknown"} · {asset.localPath ?? "无路径"}</p>
                ))}
                {!assets.some((a) => a.entityType === "round" && a.entityId === selected.id) ? <p className="mt-1 text-xs text-zinc-400">暂无</p> : null}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 grid gap-2">
              <button
                className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                disabled={analyzing}
                onClick={async () => { setAnalyzing(true); try { await onAnalyzeRound(selected); } finally { setAnalyzing(false); } }}
                type="button"
              >
                {analyzing ? "Analyzing…" : "Analyze This Round / 生成 Summary Proposal"}
              </button>
              <p className="text-xs text-zinc-500">生成的是待确认草稿，不会覆盖现有 Summary，也不会直接写入 Knowledge。</p>
              <button className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold" onClick={createManualKnowledge} type="button">Create Knowledge manually</button>
              <button
                className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                disabled={!knowledge.some((card) => card.sourceRoundId === selected.id)}
                onClick={createUpdateDraft}
                type="button"
              >
                Update Knowledge Draft
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-500">选择一个 Round 开始整理。</p>
        )}
      </aside>
    </div>
  );
}
