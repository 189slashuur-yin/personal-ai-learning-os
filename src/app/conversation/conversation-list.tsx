"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Conversation } from "@/core/entities/conversation";
import { DEFAULT_WORKSPACE_ID, type Workspace } from "@/core/entities/workspace";
import {
  batchDeleteConversationWorkspace,
  type BatchDeleteResult,
  deleteConversationWorkspace,
  duplicateConversationWorkspace,
  type ConversationWorkspaceStorages,
} from "@/core/services/conversation-workspace";
import { BrowserAnalyzerRunStorage } from "@/infrastructure/storage/browser-analyzer-run-storage";
import { BrowserAssetStorage } from "@/infrastructure/storage/browser-asset-storage";
import { BrowserTaskStorage } from "@/infrastructure/storage/browser-task-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";
import {
  createStorageInstances,
  ensureIndexedDBLoaded,
  getStorageMode,
} from "@/infrastructure/storage/storage-factory";
import { clearCaches, flushCachesToIndexedDB } from "@/infrastructure/storage/indexeddb/preload";
import { WorkspaceService } from "@/core/services/workspace-service";
import { ConversationCard } from "./conversation-card";
import { CreateConversationDialog } from "./create-conversation-dialog";

type ConversationItem = {
  conversation: Conversation;
  workspaceName: string;
  workspaceColor?: string;
  knowledgeCount: number;
  messageCount: number;
  roundCount: number;
  proposalCount: number;
};

function createWorkspaceStorages(): ConversationWorkspaceStorages {
  const businessStorages = createStorageInstances();
  return {
    conversations: businessStorages.conversations,
    sources: businessStorages.sources,
    proposals: businessStorages.proposals,
    knowledgeCards: businessStorages.knowledgeCards,
    messages: businessStorages.messages,
    analyzerRuns: new BrowserAnalyzerRunStorage(),
    versions: businessStorages.conversationVersions,
    assets: new BrowserAssetStorage(),
    rounds: businessStorages.rounds,
  };
}

function loadConversationData(): { items: ConversationItem[]; workspaces: Workspace[] } {
  const storages = createWorkspaceStorages();
  const conversations = storages.conversations.getAll();
  const workspaces = new WorkspaceService(
    new BrowserWorkspaceStorage(),
    storages.conversations,
  ).listWorkspaces();
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace]),
  );

  return { items: conversations.map((conversation) => {
    const source = storages.sources.getByConversationId(conversation.id);
    const proposals = storages.proposals.getByConversationId(conversation.id);
    const sourceProposal = source
      ? storages.proposals.getBySourceId(source.id)
      : null;
    const conversationProposals =
      sourceProposal && !proposals.some((proposal) => proposal.id === sourceProposal.id)
        ? [sourceProposal, ...proposals]
        : proposals;
    const proposalIds = new Set(conversationProposals.map((proposal) => proposal.id));

    return {
      conversation,
      workspaceName:
        workspaceById.get(conversation.workspaceId ?? DEFAULT_WORKSPACE_ID)?.name ??
        "Inbox",
      workspaceColor: workspaceById.get(
        conversation.workspaceId ?? DEFAULT_WORKSPACE_ID,
      )?.color,
      messageCount: storages.messages.getByConversationId(conversation.id).length,
      roundCount: storages.rounds?.getByConversationId(conversation.id).length ?? 0,
      proposalCount: conversationProposals.length,
      knowledgeCount: storages.knowledgeCards
        .getAll()
        .filter((card) => proposalIds.has(card.proposalId)).length,
    };
  }), workspaces };
}

export function ConversationList() {
  const [items, setItems] = useState<ConversationItem[] | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceFilter, setWorkspaceFilter] = useState("all");
  const [isCreating, setIsCreating] = useState(false);

  // P0-8: Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quickFilter, setQuickFilter] = useState<"all" | "empty" | "imported" | "failed-import">("all");
  const [deleteResult, setDeleteResult] = useState<BatchDeleteResult | null>(null);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      async function load() {
        if (getStorageMode() === "indexedDB") {
          await ensureIndexedDBLoaded();
        }
        const data = loadConversationData();
        setItems(data.items);
        setWorkspaces(data.workspaces);
        const requestedWorkspace = new URLSearchParams(window.location.search).get(
          "workspace",
        );
        if (
          requestedWorkspace &&
          data.workspaces.some((workspace) => workspace.id === requestedWorkspace)
        ) {
          setWorkspaceFilter(requestedWorkspace);
        }
      }
      void load();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  // P0-8: Derived sets for quick filters
  const emptyConversationIds = useMemo(
    () =>
      new Set(
        (items ?? [])
          .filter((item) => item.messageCount === 0 || item.roundCount === 0)
          .map((item) => item.conversation.id),
      ),
    [items],
  );

  const importedConversationIds = useMemo(
    () =>
      new Set(
        (items ?? [])
          .filter((item) => item.conversation.externalSource === "chatgpt")
          .map((item) => item.conversation.id),
      ),
    [items],
  );

  const failedImportIds = useMemo(
    () =>
      new Set(
        (items ?? [])
          .filter(
            (item) =>
              item.conversation.externalSource === "chatgpt" &&
              item.messageCount === 0 &&
              item.roundCount === 0,
          )
          .map((item) => item.conversation.id),
      ),
    [items],
  );

  async function persistAndReload() {
    if (getStorageMode() === "indexedDB") {
      await flushCachesToIndexedDB();
      clearCaches();
      await ensureIndexedDBLoaded();
    }
    const data = loadConversationData();
    setItems(data.items);
    setWorkspaces(data.workspaces);
  }

  async function handleDelete(conversation: Conversation) {
    const confirmed = window.confirm(
      `确定删除「${conversation.title}」吗？关联的 Rounds、Messages、Source、Proposal、KnowledgeCard、AnalyzerRun、Conversation History 与 Asset metadata 也会删除；真实本地文件不会删除，关联 Task 会保留并显示 source missing。`,
    );

    if (!confirmed) {
      return;
    }

    deleteConversationWorkspace(conversation.id, createWorkspaceStorages());
    await persistAndReload();

    // Verify deletion
    const verifyStorages = createWorkspaceStorages();
    if (verifyStorages.conversations.getById(conversation.id)) {
      console.error(
        `[handleDelete] Conversation ${conversation.id} still present after persistAndReload.`,
      );
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(conversation.id);
      return next;
    });
  }

  async function handleDuplicate(conversation: Conversation) {
    duplicateConversationWorkspace(conversation.id, createWorkspaceStorages());
    await persistAndReload();
  }

  async function handleMove(conversationId: string, workspaceId: string) {
    new WorkspaceService(
      new BrowserWorkspaceStorage(),
      createStorageInstances().conversations,
      new BrowserTaskStorage(),
    ).moveConversation(conversationId, workspaceId);
    await persistAndReload();
  }

  // P0-8: Batch selection helpers
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(visibleItems.map((item) => item.conversation.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  function selectAllEmpty() {
    setSelectedIds(new Set(emptyConversationIds));
  }

  // P0-8: Batch delete
  async function handleBatchDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    // Clear previous delete result before starting new delete
    setDeleteResult(null);

    const emptyCount = ids.filter((id) => emptyConversationIds.has(id)).length;

    const confirmed = window.confirm(
      `确定删除 ${ids.length} 个 Conversation 及其关联数据吗？\n\n` +
        `选中数量：${ids.length}\n` +
        `其中 0 Message / 0 Round 的数量：${emptyCount}\n\n` +
        `删除后将同时移除关联的 Messages、Rounds、Source 和 Proposals。\n` +
        `Knowledge 不会自动删除，但可能产生孤立 Knowledge。`,
    );

    if (!confirmed) return;

    // Record pre-delete counts for accurate reporting
    const preDeleteStorages = createWorkspaceStorages();
    const preDeleteConversationIds = new Set(
      preDeleteStorages.conversations.getAll().map((c) => c.id),
    );
    const actuallyExistingIds = ids.filter((id) => preDeleteConversationIds.has(id));

    // Execute batch delete — updates caches, fires background writes
    const beforeResult = batchDeleteConversationWorkspace(ids, createWorkspaceStorages());

    // Persist and reload — this is the critical step that must succeed
    try {
      await persistAndReload();
    } catch (persistError) {
      console.error(
        "[handleBatchDelete] persistAndReload failed — data may not have been written to IndexedDB.",
        persistError,
      );
      // Do NOT show success report if persistence failed
      setDeleteResult(null);
      // Report failure based on actual storage state
      alert(
        `批量删除持久化失败。${actuallyExistingIds.length} 个 Conversation 可能未被删除。请刷新页面后重试。`,
      );
      return;
    }

    // Verify deletions AFTER persist + reload: check which IDs are still present
    const postReloadStorages = createWorkspaceStorages();
    const remainingIds = new Set(
      postReloadStorages.conversations.getAll().map((c) => c.id),
    );
    const notDeleted = ids.filter((id) => remainingIds.has(id));
    if (notDeleted.length > 0) {
      console.error(
        `[handleBatchDelete] ${notDeleted.length} conversation(s) still present after persistAndReload — delete may not have persisted.`,
        notDeleted,
      );
    }

    // Report based on ACTUAL storage state after reload, not cache-based estimates
    const actualDeletedCount = ids.length - notDeleted.length;
    setDeleteResult({
      ...beforeResult,
      deletedConversations: actualDeletedCount,
    });

    if (actualDeletedCount === 0 && ids.length > 0) {
      console.error(
        `[handleBatchDelete] CRITICAL: 0 out of ${ids.length} conversations were deleted. Storage layer may be failing.`,
      );
    }

    setSelectedIds(new Set());
  }

  if (!items) {
    return (
      <p className="mt-10 text-sm text-zinc-500" role="status">
        正在读取 Conversation…
      </p>
    );
  }

  const visibleItems = items.filter((item) => {
    // Workspace filter
    if (workspaceFilter !== "all" && item.conversation.workspaceId !== workspaceFilter) {
      return false;
    }
    // Quick filter
    switch (quickFilter) {
      case "empty":
        return emptyConversationIds.has(item.conversation.id);
      case "imported":
        return importedConversationIds.has(item.conversation.id);
      case "failed-import":
        return failedImportIds.has(item.conversation.id);
      default:
        return true;
    }
  });

  const allVisibleSelected =
    visibleItems.length > 0 &&
    visibleItems.every((item) => selectedIds.has(item.conversation.id));

  const isFiltering = quickFilter !== "all";

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-zinc-500">{visibleItems.length} 个 Conversation</p>
          <label className="text-sm text-zinc-600">
            <span className="sr-only">按 Workspace 筛选</span>
            <select className="rounded-lg border border-zinc-200 bg-white px-3 py-2" onChange={(event) => setWorkspaceFilter(event.target.value)} value={workspaceFilter}>
              <option value="all">全部 Workspace</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}{workspace.archivedAt ? " (Archived)" : ""}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-3">
          <Link
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            href="/import"
          >
            导入 TXT
          </Link>
          <button
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            onClick={() => setIsCreating(true)}
            type="button"
          >
            创建 Conversation
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" aria-label="Workspace 快捷筛选">
        <button className={`rounded-full border px-3 py-1.5 text-xs font-medium ${workspaceFilter === "all" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-600"}`} onClick={() => setWorkspaceFilter("all")} type="button">All</button>
        {workspaces.filter((workspace) => !workspace.archivedAt).map((workspace) => (
          <button className={`rounded-full border px-3 py-1.5 text-xs font-medium ${workspaceFilter === workspace.id ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-600"}`} key={workspace.id} onClick={() => setWorkspaceFilter(workspace.id)} type="button">
            {workspace.name}
          </button>
        ))}
      </div>

      {/* P0-8: Batch selection toolbar & quick filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2" aria-label="批量操作">
          <button
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
            onClick={selectAllVisible}
            type="button"
            disabled={allVisibleSelected || visibleItems.length === 0}
          >
            全选当前
          </button>
          <button
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
            onClick={deselectAll}
            type="button"
            disabled={selectedIds.size === 0}
          >
            取消全选
          </button>
          {selectedIds.size > 0 ? (
            <>
              <span className="ml-1 text-xs text-zinc-500">
                {selectedIds.size} 已选择
              </span>
              <button
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                onClick={handleBatchDelete}
                type="button"
              >
                🗑 删除选中
              </button>
            </>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2" aria-label="快捷筛选">
          <span className="text-xs text-zinc-400">筛选：</span>
          <button
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              quickFilter === "all"
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
            onClick={() => { setQuickFilter("all"); setSelectedIds(new Set()); }}
            type="button"
          >
            全部
          </button>
          <button
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              quickFilter === "empty"
                ? "border-amber-600 bg-amber-100 text-amber-900"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
            onClick={() => { setQuickFilter("empty"); setSelectedIds(new Set()); }}
            type="button"
          >
            Empty ({emptyConversationIds.size})
          </button>
          <button
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              quickFilter === "imported"
                ? "border-sky-600 bg-sky-100 text-sky-900"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
            onClick={() => { setQuickFilter("imported"); setSelectedIds(new Set()); }}
            type="button"
          >
            Imported ({importedConversationIds.size})
          </button>
          <button
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              quickFilter === "failed-import"
                ? "border-red-400 bg-red-50 text-red-700"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
            onClick={() => { setQuickFilter("failed-import"); setSelectedIds(new Set()); }}
            type="button"
          >
            Failed Imports ({failedImportIds.size})
          </button>
          {quickFilter === "empty" ? (
            <button
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              onClick={selectAllEmpty}
              type="button"
            >
              一键选择所有 Empty
            </button>
          ) : null}
        </div>
      </div>

      {/* P0-8: Delete result summary */}
      {deleteResult ? (
        <div className="mt-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-5">
          <h3 className="font-semibold text-emerald-950">
            ✅ 批量删除完成
          </h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-5">
            <div>
              <dt className="text-emerald-700">删除 Conversation</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-900">
                {deleteResult.deletedConversations}
              </dd>
            </div>
            <div>
              <dt className="text-emerald-700">删除 Message</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-900">
                {deleteResult.deletedMessages}
              </dd>
            </div>
            <div>
              <dt className="text-emerald-700">删除 Round</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-900">
                {deleteResult.deletedRounds}
              </dd>
            </div>
            <div>
              <dt className="text-emerald-700">删除 Source</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-900">
                {deleteResult.deletedSources}
              </dd>
            </div>
            <div>
              <dt className="text-emerald-700">删除 Proposal</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-900">
                {deleteResult.deletedProposals}
              </dd>
            </div>
          </dl>
          {deleteResult.orphanedKnowledgeCount > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">
                ⚠️ 可能存在 {deleteResult.orphanedKnowledgeCount} 个孤立 Knowledge
              </p>
              <p className="mt-1 text-xs text-amber-800">
                这些 Knowledge 原本关联的 Proposal 已被删除，但 Knowledge 本身保留在本地存储中。可在 Data Health 页面查看详情，或手动清理。
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-emerald-700">
              无孤立 Knowledge。
            </p>
          )}
          <button
            className="mt-3 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            onClick={() => setDeleteResult(null)}
            type="button"
          >
            关闭
          </button>
        </div>
      ) : null}

      {visibleItems.length === 0 ? (
        <section className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-xl text-zinc-500">
            +
          </div>
          <h2 className="mt-4 font-semibold text-zinc-950">
            {isFiltering ? "当前筛选条件下无 Conversation。" : "暂无 Conversation。"}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
            {isFiltering
              ? "尝试切换筛选条件查看其他 Conversation。"
              : "创建一个工作空间，再粘贴对话或导入 TXT 原始文本。"}
          </p>
          {isFiltering ? (
            <button
              className="mt-5 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700"
              onClick={() => setQuickFilter("all")}
              type="button"
            >
              清除筛选
            </button>
          ) : (
            <button
              className="mt-5 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white"
              onClick={() => setIsCreating(true)}
              type="button"
            >
              创建 Conversation
            </button>
          )}
        </section>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {visibleItems.map((item) => {
            const isSelected = selectedIds.has(item.conversation.id);
            const isEmpty =
              item.messageCount === 0 || item.roundCount === 0;
            return (
              <div
                className={`rounded-2xl border p-2 transition ${
                  isSelected
                    ? "border-zinc-950 bg-zinc-50 ring-1 ring-zinc-950"
                    : "border-zinc-200 bg-white"
                }`}
                key={item.conversation.id}
              >
                {/* P0-8: Batch select checkbox */}
                <label className="mx-3 mb-1 flex cursor-pointer items-center gap-2 pt-1 text-xs text-zinc-500">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(item.conversation.id)}
                    className="h-4 w-4 accent-zinc-950"
                  />
                  选择
                  {isEmpty ? (
                    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                      Empty
                    </span>
                  ) : null}
                  {item.conversation.externalSource === "chatgpt" ? (
                    <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">
                      Imported
                    </span>
                  ) : null}
                </label>
                <ConversationCard
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  {...item}
                />
                <label className="mx-3 mb-3 block text-xs text-zinc-500">
                  移动到 Workspace / Folder
                  <select className="ml-2 rounded border border-zinc-200 bg-white px-2 py-1.5" onChange={(event) => handleMove(item.conversation.id, event.target.value)} value={item.conversation.workspaceId ?? DEFAULT_WORKSPACE_ID}>
                    {workspaces.filter((workspace) => !workspace.archivedAt).map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
      )}

      {isCreating ? (
        <CreateConversationDialog onClose={() => setIsCreating(false)} />
      ) : null}
    </>
  );
}
