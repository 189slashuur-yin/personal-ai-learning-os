"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Conversation } from "@/core/entities/conversation";
import { DEFAULT_WORKSPACE_ID, type Workspace } from "@/core/entities/workspace";
import {
  deleteConversationWorkspace,
  duplicateConversationWorkspace,
  type ConversationWorkspaceStorages,
} from "@/core/services/conversation-workspace";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserConversationVersionStorage } from "@/infrastructure/storage/browser-conversation-version-storage";
import { BrowserAnalyzerRunStorage } from "@/infrastructure/storage/browser-analyzer-run-storage";
import { BrowserAssetStorage } from "@/infrastructure/storage/browser-asset-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserTaskStorage } from "@/infrastructure/storage/browser-task-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { WorkspaceService } from "@/core/services/workspace-service";
import { ConversationCard } from "./conversation-card";
import { CreateConversationDialog } from "./create-conversation-dialog";

type ConversationItem = {
  conversation: Conversation;
  workspaceName: string;
  workspaceColor?: string;
  knowledgeCount: number;
  messageCount: number;
  proposalCount: number;
};

function createWorkspaceStorages(): ConversationWorkspaceStorages {
  return {
    conversations: new BrowserConversationStorage(),
    sources: new BrowserSourceStorage(),
    proposals: new BrowserProposalStorage(),
    knowledgeCards: new BrowserKnowledgeCardStorage(),
    messages: new BrowserMessageStorage(),
    analyzerRuns: new BrowserAnalyzerRunStorage(),
    versions: new BrowserConversationVersionStorage(),
    assets: new BrowserAssetStorage(),
    rounds: new BrowserRoundStorage(),
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

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
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
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  function handleDelete(conversation: Conversation) {
    const confirmed = window.confirm(
      `确定删除「${conversation.title}」吗？关联的 Rounds、Messages、Source、Proposal、KnowledgeCard、AnalyzerRun、Conversation History 与 Asset metadata 也会删除；真实本地文件不会删除，关联 Task 会保留并显示 source missing。`,
    );

    if (!confirmed) {
      return;
    }

    deleteConversationWorkspace(conversation.id, createWorkspaceStorages());
    setItems(loadConversationData().items);
  }

  function handleDuplicate(conversation: Conversation) {
    duplicateConversationWorkspace(conversation.id, createWorkspaceStorages());
    setItems(loadConversationData().items);
  }

  function handleMove(conversationId: string, workspaceId: string) {
    new WorkspaceService(
      new BrowserWorkspaceStorage(),
      new BrowserConversationStorage(),
      new BrowserTaskStorage(),
    ).moveConversation(conversationId, workspaceId);
    const data = loadConversationData();
    setItems(data.items);
    setWorkspaces(data.workspaces);
  }

  if (!items) {
    return (
      <p className="mt-10 text-sm text-zinc-500" role="status">
        正在读取 Conversation…
      </p>
    );
  }

  const visibleItems = items.filter(
    (item) =>
      workspaceFilter === "all" || item.conversation.workspaceId === workspaceFilter,
  );

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

      {visibleItems.length === 0 ? (
        <section className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-xl text-zinc-500">
            +
          </div>
          <h2 className="mt-4 font-semibold text-zinc-950">暂无 Conversation。</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
            创建一个工作空间，再粘贴对话或导入 TXT 原始文本。
          </p>
          <button
            className="mt-5 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white"
            onClick={() => setIsCreating(true)}
            type="button"
          >
            创建 Conversation
          </button>
        </section>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {visibleItems.map((item) => (
            <div className="rounded-2xl border border-zinc-200 bg-white p-2" key={item.conversation.id}>
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
          ))}
        </div>
      )}

      {isCreating ? (
        <CreateConversationDialog onClose={() => setIsCreating(false)} />
      ) : null}
    </>
  );
}
