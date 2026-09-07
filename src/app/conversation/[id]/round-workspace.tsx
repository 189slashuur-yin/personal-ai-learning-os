"use client";

import { useEffect, useMemo, useState } from "react";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { MessageToRoundMigrationService } from "@/core/services/message-to-round-migration";
import {
  createConversationStorage,
  createMessageStorage,
  createRoundStorage,
  createSourceStorage,
} from "@/infrastructure/storage/storage-factory";
import { RoundContextPanel } from "./round-context-panel";
import { RoundRecordPanel } from "./round-record-panel";

type RoundWorkspaceProps = {
  conversationId: string;
  onAnalyzeRound?: (round: Round) => Promise<void>;
};

function loadRounds(conversationId: string) {
  return createRoundStorage().getByConversationId(conversationId);
}

export function RoundWorkspace({
  conversationId,
  onAnalyzeRound,
}: RoundWorkspaceProps) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [requestedRoundId, setRequestedRoundId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRounds(loadRounds(conversationId));
      setMessages(createMessageStorage().getByConversationId(conversationId));
      setRequestedRoundId(new URLSearchParams(window.location.search).get("round"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversationId]);

  const roundNavigationTarget = requestedRoundId && rounds.filter((round) =>
    round.id === requestedRoundId && round.conversationId === conversationId,
  ).length === 1 ? requestedRoundId : null;

  // Wait for committed cards, without re-scrolling on ordinary Round autosaves.
  useEffect(() => {
    if (!roundNavigationTarget) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`round-${roundNavigationTarget}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [roundNavigationTarget]);

  const visibleRounds = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return rounds;
    return rounds.filter((round) =>
      [round.title, round.question, round.answer, round.note ?? "", round.summary ?? ""]
        .join("\n")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, rounds]);

  function updateRound(updatedRound: Round) {
    setRounds((current) =>
      current.map((round) =>
        round.id === updatedRound.id ? updatedRound : round,
      ),
    );
  }

  function toggleCollapsed(roundId: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(roundId)) next.delete(roundId);
      else next.add(roundId);
      return next;
    });
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

  async function generateFromLegacyMessages() {
    const migration = new MessageToRoundMigrationService(
      createConversationStorage(),
      createMessageStorage(),
      createRoundStorage(),
      createSourceStorage(),
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
    if (
      !window.confirm(
        `将从 ${preview.summary.messageCount} 条旧 Messages 生成 ${preview.summary.roundsToCreateCount} 个 Rounds。Messages 不会删除或改写，继续吗？`,
      )
    ) {
      return;
    }
    try {
      await migration.applyConversation(preview);
      setMigrationNotice(
        `已生成 ${preview.summary.roundsToCreateCount} 个 Rounds；旧 Messages 保持不变。`,
      );
      setRounds(loadRounds(conversationId));
    } catch (error) {
      setMigrationNotice(
        error instanceof Error
          ? `Round 生成失败：${error.message}`
          : "Round 生成失败，请重新预览后重试。",
      );
    }
  }

  return (
    <section
      className="detail-section min-w-0 overflow-x-clip"
      data-testid="round-workspace"
      id="section-rounds"
    >
      <div className="detail-section-heading">
        <p className="detail-kicker">05 · Rounds</p>
        <h2 className="detail-title">Conversation Rounds</h2>
        <p className="detail-description">
          每个 Round 的原文、自己的记录与历史参考保持在同一张卡片内。
        </p>
      </div>

      <div className="min-w-0" data-testid="round-workspace-content">

      {rounds.length ? (
        <label className="mt-4 block min-w-0 text-xs font-medium text-zinc-600">
          搜索 Rounds
          <input
            className="mt-1.5 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 User、Assistant 或人工记录"
            type="search"
            value={query}
          />
        </label>
      ) : null}

      <ol className="mt-4 min-w-0 space-y-4">
        {visibleRounds.map((round) => {
          const collapsed = collapsedIds.has(round.id);
          const roundMessages = round.messageIds
            .map((messageId) => messages.find((message) => message.id === messageId))
            .filter((message): message is Message => Boolean(message));

          return (
            <li
              className="min-w-0 scroll-mt-24 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5"
              data-testid="round-card"
              id={`round-${round.id}`}
              key={round.id}
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Round {round.order} · {round.messageIds.length} Messages
                  </p>
                  <h3 className="mt-1 break-words font-semibold text-zinc-950">
                    {round.title}
                  </h3>
                </div>
                <button
                  aria-expanded={!collapsed}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                  onClick={() => toggleCollapsed(round.id)}
                  type="button"
                >
                  {collapsed ? "展开" : "折叠"}
                </button>
              </div>

              {collapsed ? (
                <p className="mt-3 truncate text-sm text-zinc-500">
                  {round.summary || round.question || round.answer || "空 Round"}
                </p>
              ) : (
                <div
                  className="mt-4 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]"
                  data-testid="round-inline-layout"
                >
                  <div className="min-w-0 space-y-4" data-testid="round-content-column">
                    <div className="min-w-0 rounded-lg bg-sky-50 p-4">
                      <p className="text-xs font-semibold text-sky-800">User</p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-sky-950 [overflow-wrap:anywhere]">
                        {round.question || "（无 User 内容）"}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-lg bg-violet-50 p-4">
                      <p className="text-xs font-semibold text-violet-800">Assistant</p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-violet-950 [overflow-wrap:anywhere]">
                        {round.answer || "（无 Assistant 内容）"}
                      </p>
                    </div>

                    <details className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
                      <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                        展开原文 ({roundMessages.length || round.messageIds.length})
                      </summary>
                      {roundMessages.length ? (
                        <ol className="mt-3 min-w-0 space-y-2">
                          {roundMessages.map((message) => (
                            <li
                              className="min-w-0 rounded-lg bg-white p-3 text-sm leading-6"
                              key={message.id}
                            >
                              <p className="text-[11px] font-semibold uppercase text-zinc-500">
                                {message.role}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap break-words text-zinc-800 [overflow-wrap:anywhere]">
                                {message.content}
                              </p>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-2 text-xs text-zinc-500">
                          原始 Message 当前不可用；Round 投影仍完整保留。
                        </p>
                      )}
                    </details>

                    {onAnalyzeRound ? (
                      <button
                        className="text-xs font-semibold text-emerald-700 disabled:opacity-50"
                        disabled={analyzingId === round.id}
                        onClick={() => analyzeRound(round)}
                        type="button"
                      >
                        {analyzingId === round.id
                          ? "正在生成整理建议…"
                          : "可选：生成 AI 整理建议"}
                      </button>
                    ) : null}
                  </div>

                  <div
                    className="min-w-0"
                    data-testid="round-record-column"
                  >
                    <RoundRecordPanel onSaved={updateRound} round={round} />
                    <RoundContextPanel
                      onConfirmed={updateRound}
                      round={round}
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {rounds.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
          <p>这个 Conversation 尚无 Round；旧 Messages 仍可用。</p>
          <button
            className="mt-3 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800"
            onClick={generateFromLegacyMessages}
            type="button"
          >
            从旧 Messages 预检并生成 Rounds
          </button>
        </div>
      ) : null}
      {migrationNotice ? (
        <p
          className="mt-3 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800"
          role="status"
        >
          {migrationNotice}
        </p>
      ) : null}
      </div>
    </section>
  );
}
