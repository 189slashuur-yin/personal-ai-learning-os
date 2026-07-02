"use client";

import Link from "next/link";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Conversation } from "@/core/entities/conversation";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Message, MessageRole } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";
import { analyzeMessages, analyzeSource } from "@/core/services/demo-analyzer";
import { parseMessagesFromRawText } from "@/core/services/message-parser";
import { countWords } from "@/core/services/text-statistics";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { ProposalWorkspace } from "./proposal-workspace";

type ConversationDetailProps = {
  conversationId: string;
};

type DetailState =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "ready";
      conversation: Conversation;
      source: ImportedSource | null;
      messages: Message[];
      proposals: Proposal[];
      knowledgeCard: KnowledgeCard | null;
    };

type SaveStatus = "saved" | "editing";

const messageRoleLabels: Record<MessageRole, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  unknown: "Unknown",
};

function messageStyle(role: MessageRole) {
  if (role === "user") {
    return "ml-auto border-sky-200 bg-sky-50";
  }

  if (role === "assistant") {
    return "mr-auto border-violet-200 bg-violet-50";
  }

  return "mx-auto border-zinc-200 bg-zinc-50";
}

export function ConversationDetail({ conversationId }: ConversationDetailProps) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [draft, setDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set(),
  );
  const lastSavedContent = useRef("");

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const conversation = new BrowserConversationStorage().getById(
        conversationId,
      );

      if (!conversation) {
        setState({ status: "missing" });
        return;
      }

      const openedConversation = {
        ...conversation,
        lastOpenedAt: new Date().toISOString(),
      };
      new BrowserConversationStorage().save(openedConversation);

      const source = new BrowserSourceStorage().getByConversationId(conversationId);
      const proposalStorage = new BrowserProposalStorage();
      const conversationProposals = proposalStorage.getByConversationId(
        conversationId,
      );
      const sourceProposal = source
        ? proposalStorage.getBySourceId(source.id)
        : null;
      const proposals = (
        sourceProposal &&
        !conversationProposals.some(
          (proposal) => proposal.id === sourceProposal.id,
        )
          ? [sourceProposal, ...conversationProposals]
          : conversationProposals
      ).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const knowledgeCardStorage = new BrowserKnowledgeCardStorage();
      const knowledgeCard = proposals
        .map((proposal) => knowledgeCardStorage.getByProposalId(proposal.id))
        .find((card) => card !== null) ?? null;
      const messages = new BrowserMessageStorage().getByConversationId(
        conversationId,
      );

      const sourceContent = source?.content ?? "";
      lastSavedContent.current = sourceContent;
      setDraft(sourceContent);
      setTitleDraft(openedConversation.title);
      setLastSavedAt(source?.updatedAt ?? null);
      setState({
        status: "ready",
        conversation: openedConversation,
        source,
        messages,
        proposals,
        knowledgeCard,
      });
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [conversationId]);

  useEffect(() => {
    if (
      state.status !== "ready" ||
      draft === lastSavedContent.current ||
      (!state.source && draft.length === 0)
    ) {
      return;
    }

    const autosaveTimer = window.setTimeout(() => {
      const timestamp = new Date().toISOString();
      const nextSource: ImportedSource = {
        id: state.source?.id ?? crypto.randomUUID(),
        conversationId: state.conversation.id,
        kind: "text",
        name:
          state.source?.name ??
          `${state.conversation.title}-${state.conversation.sourceType}.txt`,
        content: draft,
        importedAt: state.source?.importedAt ?? timestamp,
        updatedAt: timestamp,
      };
      const nextConversation: Conversation = {
        ...state.conversation,
        updatedAt: timestamp,
      };

      new BrowserSourceStorage().save(nextSource);
      new BrowserConversationStorage().save(nextConversation);
      lastSavedContent.current = draft;
      setLastSavedAt(timestamp);
      setSaveStatus("saved");
      setState((currentState) =>
        currentState.status === "ready"
          ? {
              ...currentState,
              conversation: nextConversation,
              source: nextSource,
            }
          : currentState,
      );
    }, 800);

    return () => window.clearTimeout(autosaveTimer);
  }, [draft, state]);

  if (state.status === "loading") {
    return (
      <p className="workspace-shell text-sm text-zinc-500" role="status">
        正在打开 Conversation…
      </p>
    );
  }

  if (state.status === "missing") {
    return (
      <main className="workspace-shell">
        <p className="eyebrow">Not found</p>
        <h1 className="workspace-title">Conversation 不存在</h1>
        <Link
          className="mt-6 inline-block rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white"
          href="/conversation"
        >
          返回 Conversation
        </Link>
      </main>
    );
  }

  const { conversation, source, proposals, knowledgeCard } = state;
  const updatedAt = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(conversation.updatedAt));

  function runDemoAnalyzer() {
    if (state.status !== "ready" || !state.source) {
      return;
    }

    const nextProposal = analyzeSource(state.source);
    new BrowserProposalStorage().saveCurrent(nextProposal);
    setState({
      ...state,
      proposals: [nextProposal, ...state.proposals],
    });
  }

  function runMessageAnalyzer() {
    if (state.status !== "ready" || selectedMessageIds.size === 0) {
      return;
    }

    const selectedMessages = state.messages.filter((message) =>
      selectedMessageIds.has(message.id),
    );
    const nextProposal = analyzeMessages(
      state.conversation.id,
      selectedMessages,
    );
    const proposalStorage = new BrowserProposalStorage();
    proposalStorage.saveFromMessages(nextProposal);
    proposalStorage.saveCurrent(nextProposal);
    setState({
      ...state,
      proposals: [nextProposal, ...state.proposals],
    });
  }

  function deleteProposal(proposal: Proposal) {
    if (state.status !== "ready") {
      return;
    }

    const confirmed = window.confirm(
      `确定删除 Proposal「${proposal.title}」吗？已生成的 KnowledgeCard 不会被删除。`,
    );

    if (!confirmed) {
      return;
    }

    new BrowserProposalStorage().remove(proposal.id);
    setState({
      ...state,
      proposals: state.proposals.filter((item) => item.id !== proposal.id),
      knowledgeCard:
        state.knowledgeCard?.proposalId === proposal.id
          ? null
          : state.knowledgeCard,
    });
  }

  function generateMessages() {
    if (state.status !== "ready" || !draft.trim()) {
      return;
    }

    if (
      state.messages.length > 0 &&
      !window.confirm(
        `当前已有 ${state.messages.length} 条 Message。继续将覆盖现有 Messages，确定吗？`,
      )
    ) {
      return;
    }

    const messages = parseMessagesFromRawText(draft, state.conversation.id);
    new BrowserMessageStorage().replaceByConversationId(
      state.conversation.id,
      messages,
    );
    setSelectedMessageIds(new Set());
    setState({ ...state, messages });
  }

  function toggleMessage(messageId: string) {
    setSelectedMessageIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(messageId)) {
        nextIds.delete(messageId);
      } else {
        nextIds.add(messageId);
      }

      return nextIds;
    });
  }

  function saveTitle() {
    if (state.status !== "ready") {
      return;
    }

    const nextTitle = titleDraft.trim();

    if (!nextTitle) {
      setTitleDraft(state.conversation.title);
      setIsRenaming(false);
      return;
    }

    if (nextTitle === state.conversation.title) {
      setIsRenaming(false);
      return;
    }

    const nextConversation = {
      ...state.conversation,
      title: nextTitle,
      updatedAt: new Date().toISOString(),
    };
    new BrowserConversationStorage().save(nextConversation);
    setState({ ...state, conversation: nextConversation });
    setIsRenaming(false);
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }

    if (event.key === "Escape") {
      setTitleDraft(conversation.title);
      setIsRenaming(false);
    }
  }

  return (
    <main className="workspace-shell pb-24">
      <Link
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
        href="/conversation"
      >
        ← Conversation
      </Link>

      <header className="mt-8 border-b border-zinc-200 pb-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="eyebrow">Conversation workspace</p>
            {isRenaming ? (
              <input
                aria-label="Conversation 标题"
                autoFocus
                className="mt-3 w-full max-w-2xl border-b border-zinc-400 bg-transparent text-3xl font-semibold tracking-tight text-zinc-950 outline-none sm:text-4xl"
                onBlur={saveTitle}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={handleTitleKeyDown}
                value={titleDraft}
              />
            ) : (
              <button
                aria-label="重命名 Conversation"
                className="mt-3 block text-left text-3xl font-semibold tracking-tight text-zinc-950 hover:text-zinc-600 sm:text-4xl"
                onClick={() => setIsRenaming(true)}
                title="点击重命名"
                type="button"
              >
                {conversation.title}
              </button>
            )}
          </div>
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 shadow-sm">
            {conversation.sourceType}
          </span>
        </div>
      </header>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">01 · Context</p>
          <h2 className="detail-title">Conversation 信息</h2>
        </div>
        <dl className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-5 text-sm sm:grid-cols-5">
          <div>
            <dt className="text-zinc-500">来源</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {conversation.sourceType}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">更新时间</dt>
            <dd className="mt-1 font-medium text-zinc-900">{updatedAt}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">原始文本</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {source ? `${source.content.length} 字符` : "尚未保存"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Messages</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {state.messages.length} 条
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Proposals</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {proposals.length} 条
            </dd>
          </div>
        </dl>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">02 · Source</p>
          <h2 className="detail-title">原始文本 Preview</h2>
          <p className="detail-description">
            可直接使用 Ctrl+V 粘贴完整文本；保存后仍保留原文。
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <textarea
            className="min-h-64 w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-sm leading-7 text-zinc-800 outline-none focus:border-zinc-400 focus:bg-white focus:ring-2 focus:ring-zinc-100"
            onChange={(event) => {
              setDraft(event.target.value);
              setSaveStatus("editing");
            }}
            placeholder="在这里粘贴 ChatGPT、Claude、DeepSeek、Markdown 或其他原始文本…"
            value={draft}
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>{draft.length} 字符</span>
              <span>{countWords(draft)} 字</span>
              <span>
                最后保存：
                {lastSavedAt
                  ? new Intl.DateTimeFormat("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }).format(new Date(lastSavedAt))
                  : "尚未保存"}
              </span>
            </div>
            <p
              className={
                saveStatus === "saved" ? "text-emerald-700" : "text-amber-700"
              }
              role="status"
            >
              {saveStatus === "saved" ? "Saved" : "Editing..."}
            </p>
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">03 · Messages</p>
          <h2 className="detail-title">Message Timeline</h2>
          <p className="detail-description">
            按发言标记拆分原始文本，不调用 AI API。
          </p>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-500">
              {state.messages.length > 0
                ? `已生成 ${state.messages.length} 条 Message`
                : "尚未生成 Message"}
            </p>
            <button
              className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              disabled={!draft.trim()}
              onClick={generateMessages}
              type="button"
            >
              从原始文本生成 Messages
            </button>
          </div>

          {state.messages.length > 0 ? (
            <>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3">
                <p className="text-sm font-medium text-zinc-700" role="status">
                  已选择 {selectedMessageIds.size} / {state.messages.length} 条
                </p>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    onClick={() =>
                      setSelectedMessageIds(
                        new Set(state.messages.map((message) => message.id)),
                      )
                    }
                    type="button"
                  >
                    全选
                  </button>
                  <button
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={selectedMessageIds.size === 0}
                    onClick={() => setSelectedMessageIds(new Set())}
                    type="button"
                  >
                    清空选择
                  </button>
                </div>
              </div>
              <ol className="mt-4 space-y-4">
                {state.messages.map((message) => (
                  <li
                    className={`flex max-w-[90%] gap-3 rounded-xl border p-4 sm:max-w-[82%] ${messageStyle(message.role)} ${selectedMessageIds.has(message.id) ? "ring-2 ring-zinc-400 ring-offset-2" : ""}`}
                    key={message.id}
                  >
                    <input
                      aria-label={`选择第 ${message.order + 1} 条 Message`}
                      checked={selectedMessageIds.has(message.id)}
                      className="mt-0.5 size-4 shrink-0 accent-zinc-950"
                      onChange={() => toggleMessage(message.id)}
                      type="checkbox"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-4 text-xs">
                        <span className="font-semibold uppercase tracking-[0.12em] text-zinc-600">
                          {messageRoleLabels[message.role]}
                        </span>
                        <span className="text-zinc-400">#{message.order + 1}</span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                        {message.content}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex justify-end">
                <button
                  className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                  disabled={selectedMessageIds.size === 0}
                  onClick={runMessageAnalyzer}
                  type="button"
                >
                  基于选中 Messages 生成 Proposal
                </button>
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm leading-6 text-zinc-500">
              支持识别“我：”“用户：”“GPT：”“AI：”“Assistant：”。无法识别的文本会保存为 Unknown Message。
            </div>
          )}
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">04 · Proposal Workspace</p>
          <h2 className="detail-title">整理建议</h2>
          <p className="detail-description">
            按创建时间查看、追溯和管理当前 Conversation 下的所有 Proposal。
          </p>
        </div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">共 {proposals.length} 条 Proposal</p>
          <button
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!source || saveStatus === "editing"}
            onClick={runDemoAnalyzer}
            type="button"
          >
            从 Source 生成 Proposal
          </button>
        </div>
        <ProposalWorkspace proposals={proposals} onDelete={deleteProposal} />
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">05 · Knowledge</p>
          <h2 className="detail-title">KnowledgeCard</h2>
        </div>
        {knowledgeCard ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-semibold text-zinc-950">
                {knowledgeCard.title}
              </h3>
              <span className="text-xs font-semibold text-emerald-700">
                {knowledgeCard.status}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-700">
              {knowledgeCard.content}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-500">
            接受 Proposal 后，KnowledgeCard 会显示在这里。
          </div>
        )}
      </section>
    </main>
  );
}
