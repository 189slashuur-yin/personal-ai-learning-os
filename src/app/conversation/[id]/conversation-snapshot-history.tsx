"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  isChatGPTShareSnapshotMetadata,
  type ImportedSource,
} from "@/core/entities/imported-source";
import type { Round } from "@/core/entities/round";
import { messageDeepLink, roundDeepLink, type SnapshotMessageAnchor } from "@/core/services/message-navigation";
import type { Message } from "@/core/entities/message";
import {
  compareChatGPTShareSnapshotHistoryEntries,
  defaultChatGPTShareSnapshotHistorySelection,
  type ChatGPTShareSnapshotHistoryDiff,
  type ChatGPTShareSnapshotHistoryView,
} from "@/core/services/chatgpt-share-snapshot-history-view";

type ConversationSnapshotHistoryProps = {
  conversationId: string;
  history: ChatGPTShareSnapshotHistoryView;
  messages: readonly Readonly<Message>[];
  rounds?: readonly Readonly<Round>[];
  onRepeatMessageNavigation?: () => void;
};

const blockedReasonLabels: Record<string, string> = {
  "ambiguous-resource": "同一来源 identity 出现在多个 Conversation",
  "multiple-heads": "history 存在多个 head",
  cycle: "history lineage 出现循环",
  "missing-previous-snapshot": "history 缺少前序 Snapshot",
  "ownership-mismatch": "Snapshot ownership 不一致",
  "multiple-resource-histories": "Conversation 内存在多个来源 identity",
  "invalid-sequence": "Snapshot sequence 不连续",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function snapshotLabel(source: Readonly<ImportedSource>) {
  const metadata = source.shareSnapshot;
  if (!isChatGPTShareSnapshotMetadata(metadata)) return source.name;
  return `Snapshot #${metadata.snapshotSequence} · ${metadata.snapshotMessageCount} Messages`;
}

function DiffSummary({ diff }: { diff: ChatGPTShareSnapshotHistoryDiff }) {
  if (diff.status === "invalid" || diff.status === "blocked") {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        role="alert"
      >
        <p className="font-semibold">无法生成可信 diff</p>
        <p className="mt-1 leading-6">{diff.error}</p>
      </div>
    );
  }

  if (diff.status === "same") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <p className="font-semibold text-zinc-950">没有新增内容</p>
        <p className="mt-1 leading-6">
          选择的是同一个 Snapshot；前后内容相同，新增 Message 为 0。
        </p>
      </div>
    );
  }

  const assistantOnly =
    diff.addedMessages.length > 0 &&
    diff.addedAssistantMessages.length === diff.addedMessages.length;
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
      <p className="font-semibold">
        {diff.status === "initial" ? "首个 Snapshot" : "变化摘要"}
      </p>
      <p className="mt-1 leading-6">
        新增 {diff.addedMessages.length} 条 Message · Assistant {diff.addedAssistantMessages.length} · User {diff.addedUserMessages.length}
      </p>
      {assistantOnly ? (
        <p className="mt-2 font-medium text-violet-800">
          本次新增全部来自 Assistant。
        </p>
      ) : null}
    </div>
  );
}

function AnchorActions({
  conversationId,
  anchor,
  onRepeatMessageNavigation,
}: {
  conversationId: string;
  anchor?: SnapshotMessageAnchor | null;
  onRepeatMessageNavigation?: () => void;
}) {
  if (!anchor) {
    return (
      <div className="mt-3 text-xs text-amber-800">
        <button type="button" disabled className="mr-2 cursor-not-allowed opacity-60">
          定位原 Message
        </button>
        不可定位：原 Message 或 Round 引用无法验证。
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs">
      <a
        className="rounded-lg bg-zinc-950 px-3 py-2 font-semibold text-white"
        href={messageDeepLink(conversationId, anchor.messageId)}
        onClick={(event) => {
          // The browser does not navigate again for an identical hash URL.
          if (onRepeatMessageNavigation && !event.metaKey && !event.ctrlKey &&
            !event.shiftKey && !event.altKey &&
            event.currentTarget.href === window.location.href) {
            event.preventDefault();
            onRepeatMessageNavigation();
          }
        }}
      >
        定位原 Message
      </a>
      {anchor.roundId ? (
        <a
          className="rounded-lg border border-zinc-300 px-3 py-2 text-zinc-700"
          href={roundDeepLink(conversationId, anchor.roundId)}
        >
          打开所在 Round
        </a>
      ) : null}
    </div>
  );
}

export function ConversationSnapshotHistory({
  conversationId,
  history,
  messages,
  rounds,
  onRepeatMessageNavigation,
}: ConversationSnapshotHistoryProps) {
  const initialSelection = defaultChatGPTShareSnapshotHistorySelection(history);
  const historyKey =
    history.status === "valid"
      ? history.chain.map(({ id }) => id).join(":")
      : history.status;
  const [selection, setSelection] = useState(() => ({
    historyKey,
    ...initialSelection,
  }));
  const activeSelection =
    selection.historyKey === historyKey
      ? selection
      : { historyKey, ...initialSelection };
  const { beforeSourceId, afterSourceId } = activeSelection;

  const chain = history.status === "valid" ? history.chain : [];
  const afterIndex = afterSourceId
    ? chain.findIndex(({ id }) => id === afterSourceId)
    : -1;
  const selectedAfter =
    afterIndex >= 0 ? chain[afterIndex] : null;
  const selectedBefore = beforeSourceId
    ? chain.find(({ id }) => id === beforeSourceId) ?? null
    : null;
  const diff = useMemo(
    () =>
      afterSourceId
        ? compareChatGPTShareSnapshotHistoryEntries({
            history,
            canonicalMessages: messages,
            rounds,
            beforeSourceId,
            afterSourceId,
          })
        : null,
    [afterSourceId, beforeSourceId, history, messages, rounds],
  );
  const updateHref =
    history.status === "valid"
      ? `/import?importPath=existing&inputMode=share&existingTargetId=${encodeURIComponent(conversationId)}`
      : "/import?importPath=new&inputMode=share";
  const updateLabel =
    history.status === "valid"
      ? "更新 Conversation Snapshot"
      : "创建 Snapshot Conversation";

  function selectSnapshot(sourceId: string) {
    const selectedIndex = chain.findIndex(({ id }) => id === sourceId);
    setSelection({
      historyKey,
      afterSourceId: sourceId,
      beforeSourceId: chain[selectedIndex - 1]?.id ?? null,
    });
  }

  return (
    <section
      className="rounded-2xl border border-sky-200 bg-sky-50/40 p-5 sm:p-6"
      data-testid="share-snapshot-history"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
            Conversation Snapshot History
          </p>
          <h3 className="mt-2 text-lg font-semibold text-zinc-950">
            Snapshot 时间线与新增内容
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            这里展示 immutable Source chain；它与下方可 Restore 的 PALOS
            版本记录是两套独立历史。
          </p>
        </div>
        <Link
          className="rounded-lg border border-sky-200 bg-white px-3.5 py-2 text-xs font-semibold text-sky-800 hover:border-sky-300"
          href={updateHref}
        >
          {updateLabel}
        </Link>
      </div>

      {history.status === "empty" ? (
        <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-white p-5 text-sm leading-6 text-zinc-600">
          {history.legacySnapshotCount > 0 ? (
            <>
              检测到 {history.legacySnapshotCount} 个旧 Snapshot，但它们尚未形成可验证的 immutable history；当前不猜测 timeline 或 head。
            </>
          ) : (
            <>此 Conversation 尚无 Conversation Snapshot history。</>
          )}
        </div>
      ) : null}

      {history.status === "blocked" ? (
        <div
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900"
          role="alert"
        >
          <p className="font-semibold">Snapshot history 无法验证</p>
          <p className="mt-1 leading-6">
            {blockedReasonLabels[history.reason] ?? history.reason}。PALOS 不会按时间戳猜测当前 head，也不会展示可能误导的 diff。
          </p>
        </div>
      ) : null}

      {history.status === "valid" ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.8fr)]">
          <div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
              <p className="font-semibold text-zinc-950">
                {chain.length} 个 Snapshot · 当前 head #{chain.length}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Source identity · {history.resourceHash.slice(0, 12)}…
              </p>
            </div>
            <ol className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
              {[...chain].reverse().map((source) => {
                const metadata = source.shareSnapshot;
                if (!isChatGPTShareSnapshotMetadata(metadata)) return null;
                const selected = source.id === afterSourceId;
                return (
                  <li key={source.id}>
                    <button
                      aria-pressed={selected}
                      className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-sky-400 bg-sky-100" : "border-zinc-200 bg-white hover:border-zinc-300"}`}
                      data-testid={`share-snapshot-history-entry-${metadata.snapshotSequence}`}
                      onClick={() => selectSnapshot(source.id)}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-zinc-950">
                          Snapshot #{metadata.snapshotSequence}
                        </span>
                        {source.id === history.head.id ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            Current head
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {formatDate(metadata.capturedAt)} · {metadata.snapshotMessageCount} Messages
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-zinc-600">
                Snapshot 对比基线
                <select
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal text-zinc-800"
                  onChange={(event) =>
                    setSelection({
                      historyKey,
                      beforeSourceId: event.target.value || null,
                      afterSourceId,
                    })
                  }
                  value={beforeSourceId ?? ""}
                >
                  <option value="">从空白开始</option>
                  {chain.slice(0, afterIndex + 1).map((source) => (
                    <option key={source.id} value={source.id}>
                      {snapshotLabel(source)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-zinc-600">
                查看 Snapshot
                <select
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal text-zinc-800"
                  onChange={(event) => selectSnapshot(event.target.value)}
                  value={afterSourceId ?? ""}
                >
                  {chain.map((source) => (
                    <option key={source.id} value={source.id}>
                      {snapshotLabel(source)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedAfter &&
            isChatGPTShareSnapshotMetadata(selectedAfter.shareSnapshot) ? (
              <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
                <div>
                  <dt className="inline">Captured · </dt>
                  <dd className="inline font-medium text-zinc-700">
                    {formatDate(selectedAfter.shareSnapshot.capturedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="inline">Parser · </dt>
                  <dd className="inline font-medium text-zinc-700">
                    v{selectedAfter.shareSnapshot.parserVersion}
                  </dd>
                </div>
                <div>
                  <dt className="inline">Input · </dt>
                  <dd className="inline font-medium text-zinc-700">
                    {selectedAfter.shareSnapshot.inputKind}
                  </dd>
                </div>
              </dl>
            ) : null}

            <div className="mt-4">{diff ? <DiffSummary diff={diff} /> : null}</div>

            {diff?.addedAssistantMessages.length ? (
              <section className="mt-5">
                <h4 className="text-sm font-semibold text-violet-900">
                  本次新增的 Assistant 内容
                </h4>
                <ol className="mt-3 space-y-3">
                  {diff.addedAssistantMessages.map((message) => (
                    <li
                      className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm leading-6 text-violet-950"
                      key={`${afterSourceId}-assistant-${message.ordinal}`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                        Assistant · Message #{message.ordinal + 1}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                      <AnchorActions conversationId={conversationId} anchor={message.anchor} onRepeatMessageNavigation={onRepeatMessageNavigation} />
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {diff?.addedUserMessages.length ? (
              <details className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-700">
                  查看同时新增的 User 内容 ({diff.addedUserMessages.length})
                </summary>
                <ol className="mt-3 space-y-3">
                  {diff.addedUserMessages.map((message) => (
                    <li
                      className="whitespace-pre-wrap rounded-lg bg-white p-3 text-sm leading-6 text-zinc-700"
                      key={`${afterSourceId}-user-${message.ordinal}`}
                    >
                      {message.content}
                      <AnchorActions conversationId={conversationId} anchor={message.anchor} onRepeatMessageNavigation={onRepeatMessageNavigation} />
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-700">
                  查看对比前完整 Snapshot
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-zinc-700">
                  {selectedBefore?.content ?? "（空白基线）"}
                </pre>
              </details>
              <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-700">
                  查看对比后完整 Snapshot
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-zinc-700">
                  {selectedAfter?.content ?? "Snapshot 不可用"}
                </pre>
              </details>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
