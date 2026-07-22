"use client";

import { useState } from "react";
import {
  conversationContextFields,
  type ConversationContext,
  type ConversationContextField,
} from "@/core/entities/conversation";
import type { Round } from "@/core/entities/round";
import { conversationContextLabels } from "@/core/services/conversation-context-service";
import { RoundContextInheritanceService } from "@/core/services/round-context-inheritance";
import {
  createConversationStorage,
  createRoundStorage,
} from "@/infrastructure/storage/storage-factory";

function createService() {
  return new RoundContextInheritanceService(
    createConversationStorage(),
    createRoundStorage(),
  );
}

export function RoundContextPanel({
  round,
  onConfirmed,
}: {
  round: Round;
  onConfirmed: (round: Round) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [excludedFields, setExcludedFields] = useState<
    Set<ConversationContextField>
  >(new Set(round.context?.excludedFields ?? []));
  const [overrides, setOverrides] = useState<ConversationContext>({
    ...(round.context?.overrides ?? {}),
  });
  const eligibleSources = createService().listEligibleSources(round.id);
  const reference = createService().getPassiveReference(round.id);
  const selectedValue = round.context
    ? round.context.inheritanceMode === "exclude"
      ? "none"
      : round.context.sourceRoundId
        ? `round:${round.context.sourceRoundId}`
        : "conversation"
    : "auto";

  const referenceLabel =
    reference?.kind === "round"
      ? round.context
        ? `已固定参考：Round ${reference.round.order}`
        : `当前推荐参考：Round ${reference.round.order}`
      : reference?.kind === "conversation"
        ? round.context
          ? "已固定参考：Conversation Overview"
          : "当前推荐参考：Conversation Overview"
        : round.context?.inheritanceMode === "exclude"
          ? "本轮不参考历史"
          : round.context?.sourceRoundId
            ? "已固定参考：原 Round（来源不可用）"
          : "暂无历史参考";

  function applyReference(value: string) {
    const service = createService();
    const updated =
      value === "auto"
        ? service.useAutomaticReference(round.id)
        : value === "none"
          ? service.cancelInheritance(round.id, overrides)
          : service.confirm(round.id, {
              inheritanceMode: "inherit",
              sourceRoundId: value.startsWith("round:")
                ? value.slice("round:".length)
                : undefined,
              excludedFields: [...excludedFields],
              overrides,
            });

    if (!updated) {
      setNotice("参考来源保存失败，请重试。");
      return;
    }

    setNotice("参考来源已保存；当前 Round 的记录没有改变。");
    onConfirmed(updated);
  }

  function saveAdvancedAdjustments() {
    const updated = createService().confirm(round.id, {
      inheritanceMode:
        round.context?.inheritanceMode === "exclude" ? "exclude" : "inherit",
      sourceRoundId: round.context?.sourceRoundId,
      excludedFields: [...excludedFields],
      overrides,
    });

    if (!updated) {
      setNotice("高级参考设置保存失败，请重试。");
      return;
    }

    setNotice("高级参考设置已保存。");
    onConfirmed(updated);
  }

  return (
    <section
      className="mt-3 min-w-0 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3"
      data-testid={`round-reference-${round.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-medium leading-5 text-indigo-800">
          {referenceLabel}
        </p>
        <button
          aria-expanded={editorOpen}
          className="shrink-0 text-[11px] font-semibold text-indigo-700 hover:text-indigo-950"
          onClick={() => setEditorOpen((current) => !current)}
          type="button"
        >
          {editorOpen ? "收起" : "调整参考"}
        </button>
      </div>

      {editorOpen ? (
        <div className="mt-3 border-t border-indigo-100 pt-3">
          <label className="text-xs font-semibold text-zinc-700">
            本轮参考来源
            <select
              className="mt-1.5 w-full min-w-0 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-normal"
              onChange={(event) => applyReference(event.target.value)}
              value={selectedValue}
            >
              <option value="auto">自动选择最近有效 Round</option>
              {eligibleSources.map((source) => (
                <option key={source.id} value={`round:${source.id}`}>
                  Round {source.order} · {source.title}
                </option>
              ))}
              <option value="conversation">Conversation Overview</option>
              <option value="none">本轮不参考历史</option>
            </select>
          </label>

          <details className="mt-3 rounded-lg border border-indigo-100 bg-white px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-zinc-600">
              高级 override / exclude（兼容旧设置）
            </summary>
            <div className="mt-3 grid gap-3">
              {conversationContextFields.map((field) => (
                <div className="rounded-lg bg-zinc-50 p-3" key={field}>
                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                    <input
                      checked={excludedFields.has(field)}
                      onChange={(event) => {
                        setExcludedFields((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(field);
                          else next.delete(field);
                          return next;
                        });
                      }}
                      type="checkbox"
                    />
                    排除 {conversationContextLabels[field]}
                  </label>
                  <textarea
                    aria-label={`覆盖 ${conversationContextLabels[field]}`}
                    className="mt-2 min-h-16 w-full min-w-0 rounded-lg border border-zinc-200 bg-white p-2 text-xs leading-5"
                    onChange={(event) =>
                      setOverrides((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    placeholder="留空表示不覆盖"
                    value={overrides[field] ?? ""}
                  />
                </div>
              ))}
            </div>
            <button
              className="mt-3 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700"
              onClick={saveAdvancedAdjustments}
              type="button"
            >
              保存高级调整
            </button>
          </details>

          {notice ? (
            <p className="mt-2 text-xs font-medium text-indigo-800" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
