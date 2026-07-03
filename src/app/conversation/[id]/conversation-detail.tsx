"use client";

import Link from "next/link";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AnalyzerRun } from "@/core/entities/analyzer-run";
import type { Conversation } from "@/core/entities/conversation";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Message, MessageRole } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";
import type { ProviderCapability } from "@/core/entities/provider-capability";
import { DEFAULT_WORKSPACE_ID, type Workspace } from "@/core/entities/workspace";
import { AnalyzerExecutionService } from "@/core/services/analyzer-execution";
import { ImportProfileService } from "@/core/services/import-profile-service";
import { ConversationVersionService } from "@/core/services/conversation-version-service";
import { editMessage } from "@/core/services/message-editing";
import { parseMessagesFromRawText } from "@/core/services/message-parser";
import { PromptTemplateService } from "@/core/services/prompt-template-service";
import { ProviderConfigurationService } from "@/core/services/provider-configuration-service";
import { ProviderService } from "@/core/services/provider-service";
import { countWords } from "@/core/services/text-statistics";
import { WorkspaceService } from "@/core/services/workspace-service";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserConversationVersionStorage } from "@/infrastructure/storage/browser-conversation-version-storage";
import { BrowserAIProviderStorage } from "@/infrastructure/storage/browser-ai-provider-storage";
import { BrowserAnalyzerRunStorage } from "@/infrastructure/storage/browser-analyzer-run-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserPromptTemplateStorage } from "@/infrastructure/storage/browser-prompt-template-storage";
import { BrowserProviderConfigurationStorage } from "@/infrastructure/storage/browser-provider-configuration-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";
import { ProposalWorkspace } from "./proposal-workspace";
import { CapabilityBadges } from "@/app/capability-badges";

type ConversationDetailProps = {
  conversationId: string;
  importedFromClipboard?: boolean;
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
      knowledgeCount: number;
      versions: ConversationVersion[];
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

function highlightMessageContent(
  content: string,
  query: string,
  isCurrentMatch: boolean,
) {
  if (!query) {
    return content;
  }

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = content.split(new RegExp(`(${escapedQuery})`, "gi"));

  return parts.map((part, index) =>
    part.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ? (
      <mark
        className={
          isCurrentMatch
            ? "rounded bg-amber-400 px-0.5 text-zinc-950"
            : "rounded bg-amber-200 px-0.5 text-zinc-950"
        }
        key={`${part}-${index}`}
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function createAnalyzerExecutionService() {
  const provider = new ProviderService(
    new BrowserAIProviderStorage(),
    new BrowserProviderConfigurationStorage(),
    new BrowserPromptTemplateStorage(),
  ).getCurrentProvider();
  return new AnalyzerExecutionService(
    provider,
    new PromptTemplateService(new BrowserPromptTemplateStorage()),
    new BrowserAnalyzerRunStorage(),
  );
}

export function ConversationDetail({
  conversationId,
  importedFromClipboard = false,
}: ConversationDetailProps) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [draft, setDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set(),
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [savedMessageId, setSavedMessageId] = useState<string | null>(null);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotDescription, setSnapshotDescription] = useState("");
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [collapsedMessageIds, setCollapsedMessageIds] = useState<Set<string>>(
    new Set(),
  );
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [analyzerError, setAnalyzerError] = useState<string | null>(null);
  const [latestAnalyzerRun, setLatestAnalyzerRun] =
    useState<AnalyzerRun | null>(null);
  const [providerDetails] = useState<{
    id: string;
    name: string;
    capabilities: ProviderCapability[];
  }>(() => {
    if (typeof window === "undefined") {
      return { id: "demo", name: "Demo Provider", capabilities: [] };
    }

    const provider = new ProviderService(
      new BrowserAIProviderStorage(),
      new BrowserProviderConfigurationStorage(),
      new BrowserPromptTemplateStorage(),
    ).getCurrentProvider();
    const configuration = new ProviderConfigurationService(
      new BrowserProviderConfigurationStorage(),
    )
      .listConfigurations()
      .find((item) => item.providerId === provider.providerInfo.id);

    return {
      id: provider.providerInfo.id,
      name: provider.providerInfo.name,
      capabilities: configuration?.capabilities ?? [],
    };
  });
  const lastSavedContent = useRef("");
  const messageElements = useRef(new Map<string, HTMLLIElement>());
  const normalizedMessageSearch = messageSearchQuery.trim().toLocaleLowerCase();
  const searchMatchIds = useMemo(() => {
    if (state.status !== "ready" || !normalizedMessageSearch) {
      return [];
    }

    return state.messages
      .filter((message) =>
        message.content.toLocaleLowerCase().includes(normalizedMessageSearch),
      )
      .map((message) => message.id);
  }, [normalizedMessageSearch, state]);
  const currentSearchIndex = Math.min(
    activeSearchIndex,
    Math.max(searchMatchIds.length - 1, 0),
  );
  const activeSearchMessageId = searchMatchIds[currentSearchIndex] ?? null;

  useEffect(() => {
    if (!activeSearchMessageId) {
      return;
    }

    window.requestAnimationFrame(() => {
      messageElements.current.get(activeSearchMessageId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [activeSearchMessageId]);

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
      setWorkspaces(
        new WorkspaceService(
          new BrowserWorkspaceStorage(),
          new BrowserConversationStorage(),
        ).listWorkspaces(),
      );

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
      const proposalIds = new Set(proposals.map((proposal) => proposal.id));
      const knowledgeCount = knowledgeCardStorage
        .getAll()
        .filter((card) => proposalIds.has(card.proposalId)).length;
      const messages = new BrowserMessageStorage().getByConversationId(
        conversationId,
      );
      const versions =
        new BrowserConversationVersionStorage().getByConversationId(
          conversationId,
        );
      setLatestAnalyzerRun(
        new BrowserAnalyzerRunStorage().getLatestByConversationId(
          conversationId,
        ),
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
        knowledgeCount,
        versions,
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
  const importProfileService = new ImportProfileService();
  const importProfile = conversation.importProfileId
    ? importProfileService.getById(conversation.importProfileId)
    : null;
  const updatedAt = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(conversation.updatedAt));

  async function runSourceAnalyzer(simulateFailure = false) {
    if (state.status !== "ready" || !state.source) {
      return;
    }

    const result = await createAnalyzerExecutionService().runSource(state.source, {
      simulateRecoverableError: simulateFailure,
    });
    setLatestAnalyzerRun(result.run);

    if (!result.proposal) {
      setAnalyzerError(result.run.error?.message ?? "Analyzer 运行失败。");
      return;
    }

    new BrowserProposalStorage().saveCurrent(result.proposal);
    setAnalyzerError(null);
    setState({
      ...state,
      proposals: [result.proposal, ...state.proposals],
    });
  }

  async function runMessageAnalyzer() {
    if (state.status !== "ready" || selectedMessageIds.size === 0) {
      return;
    }

    const selectedMessages = state.messages.filter((message) =>
      selectedMessageIds.has(message.id),
    );
    const result = await createAnalyzerExecutionService().runMessages(
      state.conversation.id,
      selectedMessages,
    );
    setLatestAnalyzerRun(result.run);

    if (!result.proposal) {
      setAnalyzerError(result.run.error?.message ?? "Analyzer 运行失败。");
      return;
    }

    const proposalStorage = new BrowserProposalStorage();
    proposalStorage.saveFromMessages(result.proposal);
    proposalStorage.saveCurrent(result.proposal);
    setAnalyzerError(null);
    setState({
      ...state,
      proposals: [result.proposal, ...state.proposals],
    });
  }

  async function retryAnalyzer() {
    if (
      state.status !== "ready" ||
      latestAnalyzerRun?.status !== "failed" ||
      !latestAnalyzerRun.error?.recoverable
    ) {
      return;
    }

    if (latestAnalyzerRun.sourceId) {
      const retrySource = new BrowserSourceStorage()
        .getAll()
        .find((item) => item.id === latestAnalyzerRun.sourceId);

      if (!retrySource) {
        setAnalyzerError("原始 Source 已不可用，无法重试同一来源。");
        return;
      }

      const result = await createAnalyzerExecutionService().runSource(retrySource);
      setLatestAnalyzerRun(result.run);

      if (!result.proposal) {
        setAnalyzerError(result.run.error?.message ?? "Analyzer 运行失败。");
        return;
      }

      new BrowserProposalStorage().saveCurrent(result.proposal);
      setAnalyzerError(null);
      setState({
        ...state,
        proposals: [result.proposal, ...state.proposals],
      });
      return;
    }

    const retryMessageIds = latestAnalyzerRun.messageIds ?? [];
    const retryMessageIdSet = new Set(retryMessageIds);
    const retryMessages = state.messages.filter((message) =>
      retryMessageIdSet.has(message.id),
    );

    if (retryMessages.length !== retryMessageIds.length) {
      setAnalyzerError("部分原始 Messages 已不可用，无法重试同一来源。");
      return;
    }

    const result = await createAnalyzerExecutionService().runMessages(
      state.conversation.id,
      retryMessages,
    );
    setLatestAnalyzerRun(result.run);

    if (!result.proposal) {
      setAnalyzerError(result.run.error?.message ?? "Analyzer 运行失败。");
      return;
    }

    const proposalStorage = new BrowserProposalStorage();
    proposalStorage.saveFromMessages(result.proposal);
    proposalStorage.saveCurrent(result.proposal);
    setAnalyzerError(null);
    setState({
      ...state,
      proposals: [result.proposal, ...state.proposals],
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

    const profile = state.conversation.importProfileId
      ? importProfileService.getById(state.conversation.importProfileId)
      : null;
    const messages = profile
      ? importProfileService.parse(draft, state.conversation.id, profile)
      : parseMessagesFromRawText(draft, state.conversation.id);
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

  function toggleMessageCollapse(messageId: string) {
    setCollapsedMessageIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(messageId)) {
        nextIds.delete(messageId);
      } else {
        nextIds.add(messageId);
      }

      return nextIds;
    });
  }

  function moveToSearchResult(direction: -1 | 1) {
    if (searchMatchIds.length === 0) {
      return;
    }

    const nextIndex =
      (currentSearchIndex + direction + searchMatchIds.length) %
      searchMatchIds.length;
    const nextMessageId = searchMatchIds[nextIndex];

    setActiveSearchIndex(nextIndex);
    setCollapsedMessageIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(nextMessageId);
      return nextIds;
    });
  }

  function updateMessageSearch(query: string) {
    setMessageSearchQuery(query);
    setActiveSearchIndex(0);

    const normalizedQuery = query.trim().toLocaleLowerCase();
    const firstMatch = normalizedQuery
      ? state.status === "ready"
        ? state.messages.find((message) =>
            message.content.toLocaleLowerCase().includes(normalizedQuery),
          )
        : null
      : null;

    if (firstMatch) {
      setCollapsedMessageIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(firstMatch.id);
        return nextIds;
      });
    }
  }

  function startEditingMessage(message: Message) {
    setEditingMessageId(message.id);
    setMessageDraft(message.content);
    setSavedMessageId(null);
  }

  function cancelMessageEditing() {
    setEditingMessageId(null);
    setMessageDraft("");
  }

  function saveMessageEditing(messageId: string) {
    if (state.status !== "ready") {
      return;
    }

    const result = editMessage(messageId, messageDraft, {
      conversations: new BrowserConversationStorage(),
      messages: new BrowserMessageStorage(),
    });

    if (!result) {
      return;
    }

    setState({
      ...state,
      conversation: result.conversation,
      messages: state.messages.map((message) =>
        message.id === result.message.id ? result.message : message,
      ),
    });
    setEditingMessageId(null);
    setMessageDraft("");
    setSavedMessageId(messageId);
  }

  function createSnapshot() {
    if (state.status !== "ready") {
      return;
    }

    const versionStorage = new BrowserConversationVersionStorage();
    const version = new ConversationVersionService({
      conversations: new BrowserConversationStorage(),
      messages: new BrowserMessageStorage(),
      versions: versionStorage,
    }).createSnapshot(
      state.conversation.id,
      snapshotName,
      snapshotDescription,
    );

    if (!version) {
      return;
    }

    setState({
      ...state,
      versions: versionStorage.getByConversationId(state.conversation.id),
    });
    setSnapshotName("");
    setSnapshotDescription("");
  }

  function restoreSnapshot(version: ConversationVersion) {
    if (state.status !== "ready") {
      return;
    }

    const confirmed = window.confirm(
      `Restore Snapshot「${version.name}」？当前 Conversation 与 ${state.messages.length} 条 Messages 将被替换，恢复后的 Messages 会生成新 ID。Proposal、Knowledge、AnalyzerRun、Tag、Provider 与所有 Snapshots 不会改变。`,
    );

    if (!confirmed) {
      return;
    }

    const result = new ConversationVersionService({
      conversations: new BrowserConversationStorage(),
      messages: new BrowserMessageStorage(),
      versions: new BrowserConversationVersionStorage(),
    }).restoreSnapshot(state.conversation.id, version.id);

    if (!result) {
      return;
    }

    setState({
      ...state,
      conversation: result.conversation,
      messages: result.messages,
    });
    setTitleDraft(result.conversation.title);
    setSelectedMessageIds(new Set());
    setEditingMessageId(null);
    setMessageDraft("");
    setSavedMessageId(null);
    setCollapsedMessageIds(new Set());
    setMessageSearchQuery("");
    setActiveSearchIndex(0);
    setRestoreStatus("Restored successfully");
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

  function changeWorkspace(workspaceId: string) {
    if (state.status !== "ready") {
      return;
    }

    const timestamp = new Date().toISOString();
    const nextConversation = {
      ...state.conversation,
      workspaceId,
      updatedAt: timestamp,
    };
    new BrowserConversationStorage().save(nextConversation);
    setState({ ...state, conversation: nextConversation });
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
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm hover:border-zinc-300 hover:text-zinc-950"
              href={`/search?q=${encodeURIComponent(conversation.title)}&workspaceId=${encodeURIComponent(conversation.workspaceId ?? DEFAULT_WORKSPACE_ID)}&type=conversation`}
            >
              搜索此 Conversation
            </Link>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 shadow-sm">
              {conversation.sourceType}
            </span>
          </div>
        </div>
      </header>

      {importedFromClipboard ? (
        <p
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800"
          role="status"
        >
          Clipboard 导入成功：{conversation.title} · {conversation.sourceType} · {state.messages.length} Messages · {state.messages.filter((message) => message.role === "unknown").length} Unknown。
        </p>
      ) : null}

      <nav
        aria-label="Clipboard Import 流程"
        className="mt-8 rounded-xl border border-sky-200 bg-sky-50 p-5"
      >
        <p className="text-sm font-semibold text-sky-950">Clipboard → Knowledge 流程</p>
        <ol className="mt-3 grid gap-2 text-xs font-medium text-sky-900 sm:grid-cols-3 lg:grid-cols-6">
          <li>Step 1 · 原始文本</li>
          <li>Step 2 · 生成 Messages</li>
          <li>Step 3 · 选择 Messages</li>
          <li>Step 4 · 生成 Proposal</li>
          <li>
            <Link className="underline" href="/review">Step 5 · Review</Link>
          </li>
          <li>
            <Link className="underline" href="/knowledge">Step 6 · KnowledgeCard</Link>
          </li>
        </ol>
      </nav>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">01 · Context</p>
          <h2 className="detail-title">Conversation 信息</h2>
        </div>
        <dl className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-5 text-sm sm:grid-cols-3 lg:grid-cols-9">
          <div>
            <dt className="text-zinc-500">Workspace</dt>
            <dd className="mt-1">
              <select
                aria-label="切换 Workspace"
                className="max-w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 font-medium text-zinc-900"
                onChange={(event) => changeWorkspace(event.target.value)}
                value={conversation.workspaceId ?? DEFAULT_WORKSPACE_ID}
              >
                {workspaces
                  .filter(
                    (workspace) =>
                      !workspace.archivedAt || workspace.id === conversation.workspaceId,
                  )
                  .map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}{workspace.archivedAt ? " (Archived)" : ""}
                    </option>
                  ))}
              </select>
            </dd>
          </div>
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
            <dt className="text-zinc-500">Import Profile</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {importProfile?.name ?? "—"}
            </dd>
            {importProfile ? (
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                {importProfile.description}
              </p>
            ) : null}
          </div>
          <div>
            <dt className="text-zinc-500">原始文本</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {source
                ? `${source.content.length} 字符 · ${source.content.replace(/\r\n?/g, "\n").split("\n").length} 行`
                : "尚未保存"}
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
          <div>
            <dt className="text-zinc-500">Knowledge</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {state.knowledgeCount} 条
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Snapshots</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {state.versions.length} 个
            </dd>
          </div>
        </dl>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">02 · Conversation Version</p>
          <h2 className="detail-title">Conversation Snapshots</h2>
          <p className="detail-description">
            保存当前 Conversation 与 Messages；不包含 Proposal、Knowledge、AnalyzerRun、Tag 或 Provider。
          </p>
        </div>
        <div>
          {restoreStatus ? (
            <p
              className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
              role="status"
            >
              {restoreStatus}
            </p>
          ) : null}
          <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 sm:grid-cols-2">
            <label className="text-xs font-medium text-zinc-600">
              Snapshot 名称
              <input
                className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                onChange={(event) => setSnapshotName(event.target.value)}
                placeholder="例如：整理前"
                value={snapshotName}
              />
            </label>
            <label className="text-xs font-medium text-zinc-600">
              备注
              <input
                className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                onChange={(event) => setSnapshotDescription(event.target.value)}
                placeholder="可选"
                value={snapshotDescription}
              />
            </label>
            <div className="sm:col-span-2 sm:text-right">
              <button
                className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                disabled={!snapshotName.trim()}
                onClick={createSnapshot}
                type="button"
              >
                Create Snapshot
              </button>
            </div>
          </div>
          {state.versions.length > 0 ? (
            <ol className="mt-4 space-y-3">
              {state.versions.map((version) => (
                <li
                  className="rounded-xl border border-zinc-200 bg-white p-4"
                  key={version.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-zinc-950">
                        {version.name}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        {new Intl.DateTimeFormat("zh-CN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(version.createdAt))}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                        {version.messageCount} Messages
                      </span>
                      <button
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={() => restoreSnapshot(version)}
                        type="button"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-600">
                    {version.description || "无备注"}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-500">
              尚未创建 Snapshot。
            </p>
          )}
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">03 · Source</p>
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
          <p className="detail-kicker">04 · Messages</p>
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
              <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-64 flex-1 text-xs font-medium text-zinc-600">
                    Search Messages
                    <input
                      className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                      onChange={(event) => updateMessageSearch(event.target.value)}
                      placeholder="搜索 Message 内容"
                      type="search"
                      value={messageSearchQuery}
                    />
                  </label>
                  <p className="pb-2 text-xs text-zinc-500" role="status">
                    {normalizedMessageSearch
                      ? searchMatchIds.length > 0
                        ? `${currentSearchIndex + 1} / ${searchMatchIds.length}`
                        : "没有匹配项"
                      : "输入关键词开始搜索"}
                  </p>
                  <div className="flex gap-2 pb-0.5">
                    <button
                      className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={searchMatchIds.length === 0}
                      onClick={() => moveToSearchResult(-1)}
                      type="button"
                    >
                      上一条
                    </button>
                    <button
                      className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={searchMatchIds.length === 0}
                      onClick={() => moveToSearchResult(1)}
                      type="button"
                    >
                      下一条
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                  <button
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setCollapsedMessageIds(new Set())}
                    type="button"
                  >
                    全部展开
                  </button>
                  <button
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={editingMessageId !== null}
                    onClick={() =>
                      setCollapsedMessageIds(
                        new Set(state.messages.map((message) => message.id)),
                      )
                    }
                    type="button"
                  >
                    全部折叠
                  </button>
                </div>
              </div>
              <ol className="mt-4 space-y-4">
                {state.messages.map((message) => {
                  const isCollapsed = collapsedMessageIds.has(message.id);
                  const isCurrentSearchMatch =
                    activeSearchMessageId === message.id;

                  return (
                    <li
                      className={`flex max-w-[90%] scroll-mt-8 gap-3 rounded-xl border p-4 sm:max-w-[82%] ${messageStyle(message.role)} ${selectedMessageIds.has(message.id) ? "ring-2 ring-zinc-400 ring-offset-2" : ""} ${isCurrentSearchMatch ? "outline-2 outline-offset-2 outline-amber-400" : ""}`}
                      key={message.id}
                      ref={(element) => {
                        if (element) {
                          messageElements.current.set(message.id, element);
                        } else {
                          messageElements.current.delete(message.id);
                        }
                      }}
                    >
                    <input
                      aria-label={`选择第 ${message.order + 1} 条 Message`}
                      checked={selectedMessageIds.has(message.id)}
                      className="mt-0.5 size-4 shrink-0 accent-zinc-950"
                      onChange={() => toggleMessage(message.id)}
                      type="checkbox"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-semibold uppercase tracking-[0.12em] text-zinc-600">
                            {messageRoleLabels[message.role]}
                          </span>
                          <time className="text-zinc-400" dateTime={message.updatedAt}>
                            {new Intl.DateTimeFormat("zh-CN", {
                              dateStyle: "short",
                              timeStyle: "short",
                            }).format(new Date(message.updatedAt))}
                          </time>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-zinc-400">#{message.order + 1}</span>
                          <button
                            aria-expanded={!isCollapsed}
                            className="font-medium text-zinc-600 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={editingMessageId === message.id}
                            onClick={() => toggleMessageCollapse(message.id)}
                            type="button"
                          >
                            {isCollapsed ? "Expand" : "Collapse"}
                          </button>
                        </div>
                      </div>
                      {isCollapsed ? (
                        <p className="mt-2 truncate text-xs text-zinc-500">
                          {message.content}
                        </p>
                      ) : editingMessageId === message.id ? (
                        <div className="mt-3">
                          <textarea
                            aria-label={`编辑第 ${message.order + 1} 条 Message`}
                            autoFocus
                            className="min-h-32 w-full resize-y rounded-lg border border-zinc-300 bg-white p-3 text-sm leading-6 text-zinc-800 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100"
                            onChange={(event) => setMessageDraft(event.target.value)}
                            value={messageDraft}
                          />
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <span className="text-xs font-medium text-amber-700" role="status">
                              Editing
                            </span>
                            <div className="flex gap-2">
                              <button
                                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                                onClick={cancelMessageEditing}
                                type="button"
                              >
                                Cancel
                              </button>
                              <button
                                className="rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                                disabled={!messageDraft.trim()}
                                onClick={() => saveMessageEditing(message.id)}
                                type="button"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                            {highlightMessageContent(
                              message.content,
                              messageSearchQuery.trim(),
                              isCurrentSearchMatch,
                            )}
                          </p>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-emerald-700" role="status">
                              {savedMessageId === message.id ? "Saved" : ""}
                            </span>
                            <button
                              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={editingMessageId !== null}
                              onClick={() => startEditingMessage(message)}
                              type="button"
                            >
                              Edit
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-5 flex justify-end">
                <div className="text-right">
                  <p className="mb-2 text-xs text-zinc-500">
                    当前 Provider：{providerDetails.name}
                  </p>
                  <div className="mb-3 flex justify-end">
                    <CapabilityBadges capabilities={providerDetails.capabilities} />
                  </div>
                  <button
                    className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    disabled={selectedMessageIds.size === 0}
                    onClick={runMessageAnalyzer}
                    type="button"
                  >
                    基于选中 Messages 生成 Proposal
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm leading-6 text-zinc-500">
              <p className="font-medium text-zinc-700">
                请先从原始文本生成 Messages，再选择内容生成 Proposal。
              </p>
              <p className="mt-2">
              支持我、用户、User、You、ChatGPT、GPT、Assistant、Claude、AI、Gemini、DeepSeek
              等中英文发言标记。代码块中的标记不会被切分；无法识别的文本会完整保存为
              Unknown Message。
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">05 · Proposal Workspace</p>
          <h2 className="detail-title">整理建议</h2>
          <p className="detail-description">
            按创建时间查看、追溯和管理当前 Conversation 下的所有 Proposal。
          </p>
        </div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">共 {proposals.length} 条 Proposal</p>
          <div className="text-right">
            <p className="mb-2 text-xs text-zinc-500">
              当前 Provider：{providerDetails.name}
            </p>
            <div className="mb-3 flex justify-end">
              <CapabilityBadges capabilities={providerDetails.capabilities} />
            </div>
            <button
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!source || saveStatus === "editing"}
              onClick={() => runSourceAnalyzer(false)}
              type="button"
            >
              从 Source 生成 Proposal
            </button>
            {providerDetails.id === "demo" ? (
            <button
              className="ml-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!source || saveStatus === "editing"}
              onClick={() => runSourceAnalyzer(true)}
              type="button"
            >
              模拟失败
            </button>
            ) : null}
          </div>
        </div>
        {latestAnalyzerRun ? (
          <div className="mb-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
            <p className="font-medium text-zinc-900">
              最近 AnalyzerRun：{latestAnalyzerRun.status}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {latestAnalyzerRun.providerName} · {latestAnalyzerRun.startedAt}
            </p>
            {latestAnalyzerRun.error ? (
              <p className="mt-2 text-red-700">
                {latestAnalyzerRun.error.code}：{latestAnalyzerRun.error.message}
              </p>
            ) : null}
            {latestAnalyzerRun.status === "failed" &&
            latestAnalyzerRun.error?.recoverable ? (
              <button
                className="mt-3 rounded-lg bg-zinc-950 px-3.5 py-2 text-sm font-medium text-white"
                onClick={retryAnalyzer}
                type="button"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        {analyzerError ? (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>未生成 Proposal：{analyzerError}</p>
            {latestAnalyzerRun?.providerId === "ollama" ? (
              <p className="mt-2 leading-6">
                本次失败未写入 Proposal。你可以前往{" "}
                <Link className="font-semibold underline" href="/settings">
                  Settings
                </Link>{" "}
                切回 Demo Provider 后重试。
              </p>
            ) : null}
          </div>
        ) : null}
        <ProposalWorkspace proposals={proposals} onDelete={deleteProposal} />
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">06 · Knowledge</p>
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
