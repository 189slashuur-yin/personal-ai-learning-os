"use client";

import { useEffect, useMemo, useState } from "react";
import type { Round } from "@/core/entities/round";
import { createRoundStorage } from "@/infrastructure/storage/storage-factory";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";

type RoundNavigatorProps = {
  conversationId: string;
};

function excerpt(value: string, maxLength = 60) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized;
}

export function RoundNavigator({ conversationId }: RoundNavigatorProps) {
  const [expanded, setExpanded] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [proposalCounts, setProposalCounts] = useState<Map<string, number>>(
    new Map(),
  );
  const [knowledgeCounts, setKnowledgeCounts] = useState<Map<string, number>>(
    new Map(),
  );
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const roundList = createRoundStorage().getByConversationId(
        conversationId,
      );
      setRounds(roundList);

      const proposals = new BrowserProposalStorage().getAll();
      const pCounts = new Map<string, number>();
      proposals.forEach((proposal) => {
        if (proposal.sourceRoundId) {
          pCounts.set(
            proposal.sourceRoundId,
            (pCounts.get(proposal.sourceRoundId) ?? 0) + 1,
          );
        }
      });
      setProposalCounts(pCounts);

      const knowledge = new BrowserKnowledgeCardStorage().getAll();
      const kCounts = new Map<string, number>();
      knowledge.forEach((card) => {
        if (card.sourceRoundId) {
          kCounts.set(
            card.sourceRoundId,
            (kCounts.get(card.sourceRoundId) ?? 0) + 1,
          );
        }
      });
      setKnowledgeCounts(kCounts);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversationId]);

  const visibleRounds = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return rounds;
    return rounds.filter((round) =>
      [
        round.title,
        round.question,
        round.answer,
        round.note ?? "",
        round.summary ?? "",
      ]
        .join("\n")
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [rounds, searchQuery]);

  function scrollToRound(roundId: string) {
    setActiveRoundId(roundId);
    const element = document.getElementById(`round-${roundId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  const hasRounds = rounds.length > 0;

  return (
    <div
      className={`relative shrink-0 transition-[width] duration-200 ${
        expanded ? "w-64" : "w-11"
      }`}
    >
      {/* Toggle button */}
      <button
        aria-expanded={expanded}
        aria-label={expanded ? "折叠 Navigator" : "展开 Navigator"}
        className="absolute -right-2.5 top-2 z-10 flex size-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-[10px] text-zinc-500 shadow-sm hover:bg-zinc-50"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        {expanded ? "◀" : "▶"}
      </button>

      {expanded ? (
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Round Navigator
            </p>
            {hasRounds ? (
              <>
                <input
                  aria-label="搜索 Round"
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索 Round…"
                  type="search"
                  value={searchQuery}
                />
                <p className="mt-2 text-[10px] text-zinc-400">
                  {visibleRounds.length} / {rounds.length} Rounds
                </p>
              </>
            ) : null}
          </div>
          {hasRounds ? (
            <>
              <ol className="max-h-[calc(100vh-10rem)] space-y-0.5 overflow-y-auto px-2 pb-3">
                {visibleRounds.map((round) => {
                  const hasSummary = !!round.summary;
                  const proposalCount = proposalCounts.get(round.id) ?? 0;
                  const knowledgeCount = knowledgeCounts.get(round.id) ?? 0;
                  const isActive = activeRoundId === round.id;

                  return (
                    <li key={round.id}>
                      <button
                        className={`w-full rounded-lg px-2 py-2 text-left text-xs transition-colors ${
                          isActive
                            ? "bg-zinc-950 text-white"
                            : "text-zinc-700 hover:bg-zinc-100"
                        }`}
                        onClick={() => scrollToRound(round.id)}
                        type="button"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 font-mono text-[10px] opacity-60">
                            {round.order}
                          </span>
                          <span className="truncate font-medium">
                            {round.title || `Round ${round.order}`}
                          </span>
                        </div>
                        {round.question ? (
                          <p
                            className={`mt-0.5 truncate text-[10px] ${
                              isActive ? "opacity-60" : "opacity-40"
                            }`}
                          >
                            {excerpt(round.question)}
                          </p>
                        ) : null}
                        <div className="mt-1 flex items-center gap-2 text-[10px]">
                          <span
                            className={
                              hasSummary ? "text-emerald-600" : "text-zinc-300"
                            }
                            title={hasSummary ? "有 Summary" : "无 Summary"}
                          >
                            {hasSummary ? "●" : "○"} Summary
                          </span>
                          <span
                            className={
                              proposalCount > 0 ? "text-sky-600" : "text-zinc-300"
                            }
                            title={`${proposalCount} 条 Proposal`}
                          >
                            {proposalCount > 0 ? "●" : "○"} {proposalCount}P
                          </span>
                          <span
                            className={
                              knowledgeCount > 0
                                ? "text-emerald-700"
                                : "text-zinc-300"
                            }
                            title={`${knowledgeCount} 条 Knowledge`}
                          >
                            {knowledgeCount > 0 ? "●" : "○"} {knowledgeCount}K
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {visibleRounds.length === 0 ? (
                <p className="px-3 pb-4 text-center text-[10px] text-zinc-400">
                  没有匹配的 Round。
                </p>
              ) : null}
            </>
          ) : (
            /* Empty state when rounds=0 */
            <div className="px-4 pb-5 pt-1 text-center">
              <p className="text-sm font-medium text-zinc-600">暂无 Rounds</p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                导入后通常会自动生成 Rounds；如果 Raw Timeline 有 Messages 但这里为空，说明需要重新生成或检查解析。
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Collapsed rail: show round order numbers as dots, or empty indicator */
        <div className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col items-center gap-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-2">
          {hasRounds ? (
            rounds.map((round) => {
              const hasSummary = !!round.summary;
              const proposalCount = proposalCounts.get(round.id) ?? 0;
              const knowledgeCount = knowledgeCounts.get(round.id) ?? 0;
              const isActive = activeRoundId === round.id;
              const statusParts: string[] = [];
              if (hasSummary) statusParts.push("Summary");
              if (proposalCount > 0) statusParts.push(`${proposalCount} Proposal`);
              if (knowledgeCount > 0) statusParts.push(`${knowledgeCount} Knowledge`);

              const tooltip = `Round ${round.order}: ${round.title}${
                statusParts.length > 0 ? ` · ${statusParts.join(" · ")}` : ""
              }`;

              return (
                <button
                  key={round.id}
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-mono transition-colors ${
                    isActive
                      ? "bg-zinc-950 text-white"
                      : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                  }`}
                  onClick={() => scrollToRound(round.id)}
                  title={tooltip}
                  type="button"
                >
                  {round.order}
                </button>
              );
            })
          ) : (
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] text-zinc-300"
              title="暂无 Rounds"
            >
              —
            </span>
          )}
        </div>
      )}
    </div>
  );
}
