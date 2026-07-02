"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Conversation } from "@/core/entities/conversation";
import {
  deleteConversationWorkspace,
  duplicateConversationWorkspace,
  type ConversationWorkspaceStorages,
} from "@/core/services/conversation-workspace";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserAnalyzerRunStorage } from "@/infrastructure/storage/browser-analyzer-run-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { ConversationCard } from "./conversation-card";
import { CreateConversationDialog } from "./create-conversation-dialog";

type ConversationItem = {
  conversation: Conversation;
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
  };
}

function loadConversationItems(): ConversationItem[] {
  const storages = createWorkspaceStorages();
  const conversations = storages.conversations.getAll();

  return conversations.map((conversation) => {
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
      messageCount: storages.messages.getByConversationId(conversation.id).length,
      proposalCount: conversationProposals.length,
      knowledgeCount: storages.knowledgeCards
        .getAll()
        .filter((card) => proposalIds.has(card.proposalId)).length,
    };
  });
}

export function ConversationList() {
  const [items, setItems] = useState<ConversationItem[] | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      setItems(loadConversationItems());
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  function handleDelete(conversation: Conversation) {
    const confirmed = window.confirm(
      `确定删除「${conversation.title}」吗？关联的 Messages、Source、Proposal、KnowledgeCard 与 AnalyzerRun 也会删除。`,
    );

    if (!confirmed) {
      return;
    }

    deleteConversationWorkspace(conversation.id, createWorkspaceStorages());
    setItems(loadConversationItems());
  }

  function handleDuplicate(conversation: Conversation) {
    duplicateConversationWorkspace(conversation.id, createWorkspaceStorages());
    setItems(loadConversationItems());
  }

  if (!items) {
    return (
      <p className="mt-10 text-sm text-zinc-500" role="status">
        正在读取 Conversation…
      </p>
    );
  }

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">{items.length} 个 Conversation</p>
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

      {items.length === 0 ? (
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
          {items.map((item) => (
            <ConversationCard
              key={item.conversation.id}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              {...item}
            />
          ))}
        </div>
      )}

      {isCreating ? (
        <CreateConversationDialog onClose={() => setIsCreating(false)} />
      ) : null}
    </>
  );
}
