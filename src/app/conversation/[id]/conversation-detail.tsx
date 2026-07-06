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
import type { Round } from "@/core/entities/round";
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
import { deriveQAPairs } from "@/core/services/qa-pair-service";
import { countWords } from "@/core/services/text-statistics";
import { TaskService } from "@/core/services/task-service";
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
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserTaskStorage } from "@/infrastructure/storage/browser-task-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";
import { BrowserAppEventLogStorage } from "@/infrastructure/storage/browser-feedback-storage";
import { ProposalWorkspace } from "./proposal-workspace";
import { ConversationAssets } from "./conversation-assets";
import { RoundWorkspace } from "./round-workspace";
import { ConversationWorkspaceMode } from "./conversation-workspace-mode";
import { RoundNavigator } from "./round-navigator";
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
type MessageView = "timeline" | "qa-pairs";
type QAPairSort = "order" | "updated" | "question";

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

function excerpt(value: string, maxLength = 240) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized;
}

function createAnalyzerExecutionService(providerId?: string) {
  const providerService = new ProviderService(
    new BrowserAIProviderStorage(),
    new BrowserProviderConfigurationStorage(),
    new BrowserPromptTemplateStorage(),
  );
  const provider = providerId ? providerService.getProviderForRun(providerId) : providerService.getCurrentProvider();
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
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [conclusionDraft, setConclusionDraft] = useState("");
  const [pendingQuestionsDraft, setPendingQuestionsDraft] = useState("");
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
  const [messageView, setMessageView] = useState<MessageView>("timeline");
  const [isMessageDataVisible, setIsMessageDataVisible] = useState(false);
  const [detailMode, setDetailMode] = useState<"classic" | "workspace">("classic");
  const [qaPairSearchQuery, setQAPairSearchQuery] = useState("");
  const [qaPairSort, setQAPairSort] = useState<QAPairSort>("order");
  const [collapsedQAPairIds, setCollapsedQAPairIds] = useState<Set<string>>(
    new Set(),
  );
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [analyzerError, setAnalyzerError] = useState<string | null>(null);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [latestAnalyzerRun, setLatestAnalyzerRun] =
    useState<AnalyzerRun | null>(null);
  const [analyzeProviderId, setAnalyzeProviderId] = useState("demo");
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
  const qaPairs = useMemo(
    () => (state.status === "ready" ? deriveQAPairs(state.messages) : []),
    [state],
  );
  const visibleQAPairs = useMemo(() => {
    const query = qaPairSearchQuery.trim().toLocaleLowerCase();
    const filtered = query
      ? qaPairs.filter((pair) =>
          `${pair.questionText}\n${pair.answerText}`
            .toLocaleLowerCase()
            .includes(query),
        )
      : [...qaPairs];

    return filtered.sort((left, right) => {
      if (qaPairSort === "updated") {
        return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
      }

      if (qaPairSort === "question") {
        const leftTitle = left.questionText || left.answerText;
        const rightTitle = right.questionText || right.answerText;
        return leftTitle.localeCompare(rightTitle, "zh-CN");
      }

      return left.order - right.order;
    });
  }, [qaPairSearchQuery, qaPairSort, qaPairs]);

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
      if (new URLSearchParams(window.location.search).get("mode") === "workspace") {
        setDetailMode("workspace");
      }

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
      setAnalyzeProviderId(providerDetails.id);

      const sourceContent = source?.content ?? "";
      lastSavedContent.current = sourceContent;
      setDraft(sourceContent);
      setTitleDraft(openedConversation.title);
      setNoteDraft(openedConversation.note ?? "");
      setSummaryDraft(openedConversation.summary ?? "");
      setConclusionDraft(openedConversation.conclusion ?? "");
      setPendingQuestionsDraft(openedConversation.pendingQuestions ?? "");
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
  }, [conversationId, providerDetails.id]);

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

  const { conversation, source, proposals, knowledgeCard, knowledgeCount } = state;
  const importProfileService = new ImportProfileService();
  const importProfile = conversation.importProfileId
    ? importProfileService.getById(conversation.importProfileId)
    : null;
  const updatedAt = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(conversation.updatedAt));
  const hasOriginalContent = draft.trim().length > 0;
  const activeFlowStep = !hasOriginalContent
    ? 1
    : state.messages.length === 0
      ? 2
      : knowledgeCount > 0
        ? 6
        : proposals.length > 0
          ? 5
          : selectedMessageIds.size > 0
            ? 4
            : 3;
  const flowSteps = [
    "原始内容",
    "Messages",
    "Q&A Pair",
    "Analyze",
    "Review",
    "Knowledge",
  ];

  async function runSourceAnalyzer(simulateFailure = false) {
    if (state.status !== "ready" || !state.source) {
      return;
    }

    setLatestAnalyzerRun({ id: "pending", conversationId: state.conversation.id, sourceId: state.source.id, providerId: providerDetails.id, providerName: providerDetails.name, status: "running", startedAt: new Date().toISOString() });
    new BrowserAppEventLogStorage().record("analyze started", state.conversation.id, analyzeProviderId);
    const result = await createAnalyzerExecutionService(analyzeProviderId).runSource(state.source, {
      simulateRecoverableError: simulateFailure,
    });
    setLatestAnalyzerRun(result.run);

    if (!result.proposal) {
      new BrowserAppEventLogStorage().record("analyze failed", state.conversation.id, result.run.error?.message);
      setAnalyzerError(result.run.error?.message ?? "Analyzer 运行失败。");
      return;
    }

    const conversationProposal: Proposal = {
      ...result.proposal,
      sourceType: "conversation",
    };
    new BrowserProposalStorage().saveCurrent(conversationProposal);
    setAnalyzerError(null);
    setState({
      ...state,
      proposals: [conversationProposal, ...state.proposals],
    });
  }

  async function runRoundAnalyzer(round: Round) {
    if (state.status !== "ready") return;
    setLatestAnalyzerRun({ id: "pending", conversationId: state.conversation.id, roundId: round.id, providerId: providerDetails.id, providerName: providerDetails.name, status: "running", startedAt: new Date().toISOString() });
    const messageIdSet = new Set(round.messageIds);
    const roundMessages = state.messages.filter((message) => messageIdSet.has(message.id));
    const result = await createAnalyzerExecutionService(analyzeProviderId).runRound(round, roundMessages);
    setLatestAnalyzerRun(result.run);
    if (!result.proposal) {
      setAnalyzerError(result.run.error?.message ?? "Round Analyzer 运行失败。");
      return;
    }
    const proposalStorage = new BrowserProposalStorage();
    proposalStorage.save(result.proposal);
    proposalStorage.saveCurrent(result.proposal);
    setAnalyzerError(null);
    setState({ ...state, proposals: [result.proposal, ...state.proposals] });
  }

  async function runConversationSummaryAnalyzer() {
    if (state.status !== "ready") return;
    setLatestAnalyzerRun({ id: "pending", conversationId: state.conversation.id, providerId: providerDetails.id, providerName: providerDetails.name, status: "running", startedAt: new Date().toISOString() });
    const rounds = new BrowserRoundStorage().getByConversationId(state.conversation.id);
    const timestamp = new Date().toISOString();
    const summaryMessages: Message[] = rounds.flatMap((round, index) => [
      ...(round.question ? [{ id: `summary-q-${round.id}`, conversationId: state.conversation.id, role: "user" as const, content: round.question, order: index * 2 + 1, createdAt: timestamp, updatedAt: timestamp }] : []),
      ...(round.answer ? [{ id: `summary-a-${round.id}`, conversationId: state.conversation.id, role: "assistant" as const, content: round.answer, order: index * 2 + 2, createdAt: timestamp, updatedAt: timestamp }] : []),
    ]);
    const result = await createAnalyzerExecutionService(analyzeProviderId).runMessages(state.conversation.id, summaryMessages);
    setLatestAnalyzerRun(result.run);
    if (!result.proposal) {
      setAnalyzerError(result.run.error?.message ?? "Conversation Summary Analyzer 运行失败。");
      return;
    }
    const proposal: Proposal = { ...result.proposal, sourceType: "conversation", sourceMessageIds: rounds.flatMap((round) => round.messageIds), title: `Conversation Summary Draft · ${state.conversation.title}` };
    const storage = new BrowserProposalStorage();
    storage.save(proposal);
    storage.saveCurrent(proposal);
    setState({ ...state, proposals: [proposal, ...state.proposals] });
  }

  function createTaskFromConversation() {
    if (state.status !== "ready") return;

    setTaskNotice(null);
    setTaskError(null);

    try {
      const recentMessageSummary = state.messages
        .slice(-3)
        .map((message) => `${messageRoleLabels[message.role]}: ${message.content}`)
        .join("\n");

      new TaskService(
        new BrowserTaskStorage(),
        new BrowserWorkspaceStorage(),
      ).createTask({
        title: `Follow up: ${state.conversation.title}`,
        status: "inbox",
        type: "todo",
        priority: "medium",
        workspaceId: state.conversation.workspaceId,
        sourceRef: {
          type: "conversation",
          entityId: state.conversation.id,
          titleSnapshot: state.conversation.title,
          summarySnapshot: excerpt(
            state.source?.content || recentMessageSummary || state.conversation.title,
          ),
        },
      });
      setTaskNotice("Task 已创建，并保留当前 Conversation 来源快照。");
    } catch {
      setTaskError("Task 创建失败，请确认浏览器允许本地保存。");
    }
  }

  function createTaskFromSelectedMessages() {
    if (state.status !== "ready" || selectedMessageIds.size === 0) return;

    setTaskNotice(null);
    setTaskError(null);

    try {
      const selectedMessages = state.messages.filter((message) =>
        selectedMessageIds.has(message.id),
      );
      const selectedCount = selectedMessages.length;

      new TaskService(
        new BrowserTaskStorage(),
        new BrowserWorkspaceStorage(),
      ).createTask({
        title: `Follow up on ${selectedCount} messages: ${state.conversation.title}`,
        status: "inbox",
        type: "todo",
        priority: "medium",
        workspaceId: state.conversation.workspaceId,
        sourceRef: {
          type: "message",
          entityId: selectedMessages[0].id,
          titleSnapshot: `${state.conversation.title} · ${selectedCount} selected messages`,
          summarySnapshot: excerpt(
            selectedMessages
              .map((message) => `${messageRoleLabels[message.role]}: ${message.content}`)
              .join("\n"),
          ),
        },
      });
      setTaskNotice(
        `Task 已从 ${selectedCount} 条选中 Messages 创建，并保留来源快照。`,
      );
    } catch {
      setTaskError("Task 创建失败，请确认浏览器允许本地保存。");
    }
  }

  async function runMessageAnalyzer() {
    if (state.status !== "ready" || selectedMessageIds.size === 0) {
      return;
    }

    setLatestAnalyzerRun({ id: "pending", conversationId: state.conversation.id, providerId: providerDetails.id, providerName: providerDetails.name, status: "running", startedAt: new Date().toISOString() });
    const selectedMessages = state.messages.filter((message) =>
      selectedMessageIds.has(message.id),
    );
    const result = await createAnalyzerExecutionService(analyzeProviderId).runMessages(
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

  function switchToDemo() {
    new ProviderService(
      new BrowserAIProviderStorage(),
      new BrowserProviderConfigurationStorage(),
      new BrowserPromptTemplateStorage(),
    ).selectProvider("demo");
    window.location.reload();
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

  function toggleQAPair(messageIds: string[]) {
    setSelectedMessageIds((currentIds) => {
      const nextIds = new Set(currentIds);
      const allSelected = messageIds.every((messageId) =>
        nextIds.has(messageId),
      );

      messageIds.forEach((messageId) => {
        if (allSelected) nextIds.delete(messageId);
        else nextIds.add(messageId);
      });
      return nextIds;
    });
  }

  function toggleQAPairCollapse(pairId: string) {
    setCollapsedQAPairIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(pairId)) nextIds.delete(pairId);
      else nextIds.add(pairId);
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
      `恢复到版本记录「${version.name}」？当前 Conversation 与 ${state.messages.length} 条 Messages 将被替换，恢复后的 Messages 会生成新 ID。Proposal、Knowledge、AnalyzerRun、Tag、Provider 与其他恢复点不会改变。`,
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

  function saveNote() {
    if (state.status !== "ready") {
      return;
    }

    const normalizedNote = noteDraft.trim();
    const currentNote = state.conversation.note ?? "";

    if (normalizedNote === currentNote) {
      setNoteDraft(currentNote);
      setIsEditingNote(false);
      return;
    }

    const nextConversation: Conversation = {
      ...state.conversation,
      note: normalizedNote || undefined,
      updatedAt: new Date().toISOString(),
    };
    new BrowserConversationStorage().save(nextConversation);
    setState({ ...state, conversation: nextConversation });
    setNoteDraft(nextConversation.note ?? "");
    setIsEditingNote(false);
  }

  function cancelNoteEditing() {
    if (state.status !== "ready") {
      return;
    }

    setNoteDraft(state.conversation.note ?? "");
    setIsEditingNote(false);
  }

  function saveConversationSummary() {
    if (state.status !== "ready") return;
    const nextConversation: Conversation = {
      ...state.conversation,
      summary: summaryDraft.trim() || undefined,
      conclusion: conclusionDraft.trim() || undefined,
      pendingQuestions: pendingQuestionsDraft.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    new BrowserConversationStorage().save(nextConversation);
    setState({ ...state, conversation: nextConversation });
  }

  function exportConversation(format: "json" | "markdown") {
    if (state.status !== "ready") return;
    const rounds = new BrowserRoundStorage().getByConversationId(state.conversation.id);
    const content = format === "json" ? JSON.stringify({ conversation: state.conversation, rounds, messages: state.messages }, null, 2) : `# ${state.conversation.title}\n\n${rounds.map((round) => `## Round ${round.order}: ${round.title}\n\n**Q:** ${round.question}\n\n**A:** ${round.answer}\n\n${round.summary ? `Summary: ${round.summary}\n` : ""}`).join("\n")}`;
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/markdown" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${state.conversation.title}.${format === "json" ? "json" : "md"}`; link.click(); URL.revokeObjectURL(link.href);
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
            <button className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold" onClick={() => exportConversation("markdown")} type="button">Export Markdown</button>
            <button className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold" onClick={() => exportConversation("json")} type="button">Export JSON</button>
            <div className="flex rounded-lg border border-zinc-200 bg-white p-1 text-xs font-semibold"><button className={`rounded-md px-3 py-1.5 ${detailMode === "classic" ? "bg-zinc-950 text-white" : "text-zinc-600"}`} onClick={() => setDetailMode("classic")} type="button">Classic</button><button className={`rounded-md px-3 py-1.5 ${detailMode === "workspace" ? "bg-zinc-950 text-white" : "text-zinc-600"}`} onClick={() => setDetailMode("workspace")} type="button">Workspace Mode</button></div>
            <button
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm hover:border-zinc-300 hover:text-zinc-950"
              onClick={createTaskFromConversation}
              type="button"
            >
              Create Task（可选）
            </button>
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

      <div className="flex gap-6">
        <RoundNavigator conversationId={conversation.id} />
        <div className="min-w-0 flex-1">

      {taskNotice ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800" role="status">
          <span>{taskNotice}</span>
          <span className="flex gap-3 font-semibold">
            <Link className="underline" href="/tasks">前往 Tasks</Link>
            <Link className="underline" href="/today">前往 Today</Link>
          </span>
        </div>
      ) : null}
      {taskError ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700" role="alert">{taskError}</p>
      ) : null}

      {importedFromClipboard ? (
        <p
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800"
          role="status"
        >
          Clipboard 导入成功：{conversation.title} · {conversation.sourceType} · {state.messages.length} Messages · {state.messages.filter((message) => message.role === "unknown").length} Unknown。
        </p>
      ) : null}

      <nav aria-label="Conversation 整理流程" className="mt-8 rounded-xl border border-sky-200 bg-sky-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-sky-950">Conversation → Knowledge 流程</p>
            <p className="mt-1 text-xs text-sky-800">当前建议处理 Step {activeFlowStep}</p>
          </div>
          <Link className="text-xs font-semibold text-sky-900 underline" href="/help">查看操作手册</Link>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {flowSteps.map((label, index) => {
            const step = index + 1;
            const active = step === activeFlowStep;
            const completed = step < activeFlowStep;
            return (
              <li
                className={`rounded-lg border px-3 py-3 text-xs font-semibold ${active ? "border-sky-600 bg-white text-sky-950 shadow-sm ring-2 ring-sky-200" : completed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sky-100 bg-sky-100/60 text-sky-700"}`}
                key={label}
              >
                <span className="block text-[10px] uppercase tracking-wider">Step {step}</span>
                <span className="mt-1 block">{label}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 text-sm leading-6 text-sky-950">
          {!hasOriginalContent ? (
            <p>还没有原始内容。请先前往 <Link className="font-semibold underline" href="/import">Import</Link> 导入材料。</p>
          ) : state.messages.length === 0 ? (
            <p>原始内容已就绪。下一步请点击“从原始文本生成 Messages”。</p>
          ) : proposals.length > 0 && knowledgeCount === 0 ? (
            <p>整理建议已经生成。请前往 <Link className="font-semibold underline" href="/review">Review</Link> 人工审核。</p>
          ) : knowledgeCount > 0 ? (
            <p>已有 Knowledge。你仍可继续从 Timeline 或 Q&amp;A Pair 选择其它内容整理。</p>
          ) : selectedMessageIds.size > 0 ? (
            <p>已选择 {selectedMessageIds.size} 条 Messages。下一步点击“Analyze / 生成整理建议”。</p>
          ) : (
            <p>Messages 已就绪。可用 Timeline 查看原始轮次，或切换 Q&amp;A Pair 按一问一答阅读和选择。</p>
          )}
        </div>
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
            <dt className="text-zinc-500">History</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {state.versions.length} 个
            </dd>
          </div>
        </dl>
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">备注 / Note</h3>
              <p className="mt-1 text-xs text-zinc-500">
                仅记录 Conversation 级上下文，不会写入 Tags、Proposal 或 Knowledge。
              </p>
            </div>
            {!isEditingNote ? (
              <button
                className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:border-zinc-300 hover:text-zinc-950"
                onClick={() => setIsEditingNote(true)}
                type="button"
              >
                编辑备注
              </button>
            ) : null}
          </div>
          {isEditingNote ? (
            <div className="mt-4">
              <textarea
                aria-label="Conversation 备注"
                autoFocus
                className="min-h-28 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm leading-6 text-zinc-900 outline-none focus:border-zinc-400"
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="记录背景、后续整理方向或其它私有备注…"
                value={noteDraft}
              />
              <div className="mt-3 flex gap-2">
                <button
                  className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                  onClick={saveNote}
                  type="button"
                >
                  保存备注
                </button>
                <button
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-zinc-300"
                  onClick={cancelNoteEditing}
                  type="button"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
              {conversation.note || "暂无备注。"}
            </p>
          )}
        </div>
      </section>

      <ConversationAssets conversationId={conversation.id} />

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">03 · History / 版本记录</p>
          <h2 className="detail-title">Conversation History</h2>
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
              恢复点名称
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
                创建恢复点
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
                        恢复此版本
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
              尚未创建恢复点。
            </p>
          )}
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">04 · Source</p>
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

      <section className="detail-section"><div className="detail-section-heading"><p className="detail-kicker">Summary</p><h2 className="detail-title">Conversation Summary</h2><p className="detail-description">总结、最终结论与待确认点由你确认后保存；Analyzer 只生成 Proposal 草稿。</p></div><div className="rounded-xl border border-zinc-200 bg-white p-5"><div className="grid gap-4 lg:grid-cols-3"><label className="text-sm font-semibold">总结<textarea className="mt-2 min-h-28 w-full rounded-lg border border-zinc-200 p-3 font-normal" onChange={(event) => setSummaryDraft(event.target.value)} value={summaryDraft} /></label><label className="text-sm font-semibold">最终结论<textarea className="mt-2 min-h-28 w-full rounded-lg border border-zinc-200 p-3 font-normal" onChange={(event) => setConclusionDraft(event.target.value)} value={conclusionDraft} /></label><label className="text-sm font-semibold">待确认点<textarea className="mt-2 min-h-28 w-full rounded-lg border border-zinc-200 p-3 font-normal" onChange={(event) => setPendingQuestionsDraft(event.target.value)} value={pendingQuestionsDraft} /></label></div><div className="mt-4 flex flex-wrap gap-3"><button className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white" onClick={saveConversationSummary} type="button">确认保存</button><button className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold" onClick={runConversationSummaryAnalyzer} type="button">从所有 Rounds 生成 Summary Proposal</button></div></div></section>

      {detailMode === "workspace" ? <ConversationWorkspaceMode conversationId={conversationId} onAnalyzeRound={runRoundAnalyzer} /> : <RoundWorkspace conversationId={conversationId} onAnalyzeRound={runRoundAnalyzer} />}

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">06 · Messages (underlying data)</p>
          <h2 className="detail-title">Advanced / Raw Data · Message Timeline</h2>
          <p className="detail-description">
            底层原始数据默认折叠；旧 Message / Q&amp;A Pair 功能继续可用。
          </p>
        </div>
        <button aria-expanded={isMessageDataVisible} className="mb-4 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50" onClick={() => setIsMessageDataVisible((visible) => !visible)} type="button">{isMessageDataVisible ? "折叠 Message Timeline" : `展开 Message Timeline（${state.messages.length}）`}</button>
        {isMessageDataVisible ? <div>
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
                  <button
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={selectedMessageIds.size === 0}
                    onClick={createTaskFromSelectedMessages}
                    type="button"
                  >
                    Create Task（可选）
                  </button>
                </div>
              </div>
              <div className="mt-4 inline-flex rounded-lg border border-zinc-200 bg-white p-1" aria-label="Message 阅读视图">
                <button
                  aria-pressed={messageView === "timeline"}
                  className={`rounded-md px-4 py-2 text-sm font-medium ${messageView === "timeline" ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
                  onClick={() => setMessageView("timeline")}
                  type="button"
                >
                  Timeline
                </button>
                <button
                  aria-pressed={messageView === "qa-pairs"}
                  className={`rounded-md px-4 py-2 text-sm font-medium ${messageView === "qa-pairs" ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
                  onClick={() => setMessageView("qa-pairs")}
                  type="button"
                >
                  Q&amp;A Pair ({qaPairs.length})
                </button>
              </div>
              {messageView === "timeline" ? (
                <>
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
                </>
              ) : (
                <div className="mt-4">
                  <div className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-[1fr_auto]">
                    <label className="text-xs font-medium text-zinc-600">
                      Search Q&amp;A Pair
                      <input
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                        onChange={(event) => setQAPairSearchQuery(event.target.value)}
                        placeholder="搜索问题或回答"
                        type="search"
                        value={qaPairSearchQuery}
                      />
                    </label>
                    <label className="text-xs font-medium text-zinc-600">
                      排序
                      <select
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                        onChange={(event) => setQAPairSort(event.target.value as QAPairSort)}
                        value={qaPairSort}
                      >
                        <option value="order">原始顺序</option>
                        <option value="updated">最近更新</option>
                        <option value="question">问题标题 A-Z</option>
                      </select>
                    </label>
                  </div>
                  <p className="mt-3 text-xs text-zinc-500" role="status">
                    显示 {visibleQAPairs.length} / {qaPairs.length} 个 Pair；选择 Pair 会选择其中全部 Messages。
                  </p>
                  <ol className="mt-3 space-y-3">
                    {visibleQAPairs.map((pair) => {
                      const isCollapsed = collapsedQAPairIds.has(pair.id);
                      const allSelected = pair.messageIds.every((messageId) =>
                        selectedMessageIds.has(messageId),
                      );

                      return (
                        <li
                          className={`rounded-xl border bg-white p-4 ${allSelected ? "border-zinc-500 ring-2 ring-zinc-200" : "border-zinc-200"}`}
                          key={pair.id}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              aria-label={`选择第 ${pair.order} 个 Q&A Pair`}
                              checked={allSelected}
                              className="mt-1 size-4 shrink-0 accent-zinc-950"
                              onChange={() => toggleQAPair(pair.messageIds)}
                              type="checkbox"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                                    Pair #{pair.order}
                                  </span>
                                  <span className="text-xs text-zinc-500">
                                    {pair.messageIds.length} Messages
                                  </span>
                                  {pair.kind === "orphan-assistant" ? (
                                    <span className="text-xs font-medium text-amber-700">Orphan Assistant</span>
                                  ) : pair.kind === "unanswered" ? (
                                    <span className="text-xs font-medium text-sky-700">未回答</span>
                                  ) : null}
                                </div>
                                <button
                                  aria-expanded={!isCollapsed}
                                  className="text-xs font-medium text-zinc-600 hover:text-zinc-950"
                                  onClick={() => toggleQAPairCollapse(pair.id)}
                                  type="button"
                                >
                                  {isCollapsed ? "展开" : "折叠"}
                                </button>
                              </div>
                              <p className="mt-3 text-sm font-medium text-zinc-900">
                                问：{excerpt(pair.questionText || "（无问题，Assistant 独立内容）", 100)}
                              </p>
                              <p className="mt-2 text-sm text-zinc-600">
                                答：{excerpt(pair.answerText || "（尚未回答）", 120)}
                              </p>
                              {!isCollapsed ? (
                                <div className="mt-4 grid gap-3 border-t border-zinc-100 pt-4 md:grid-cols-2">
                                  <div className="rounded-lg bg-sky-50 p-3">
                                    <p className="text-xs font-semibold text-sky-800">Question</p>
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-sky-950">
                                      {pair.questionText || "无 User / Unknown 问题。"}
                                    </p>
                                  </div>
                                  <div className="rounded-lg bg-violet-50 p-3">
                                    <p className="text-xs font-semibold text-violet-800">Answer</p>
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-violet-950">
                                      {pair.answerText || "尚无 Assistant 回答。"}
                                    </p>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  {visibleQAPairs.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-500">
                      没有匹配的 Q&amp;A Pair。
                    </p>
                  ) : null}
                </div>
              )}
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
                    Analyze / 生成整理建议
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm leading-6 text-zinc-500">
              <p className="font-medium text-zinc-700">
                请先从原始文本生成 Messages，再选择内容 Analyze / 生成整理建议。
              </p>
              <p className="mt-2">
              支持我、用户、User、You、ChatGPT、GPT、Assistant、Claude、AI、Gemini、DeepSeek
              等中英文发言标记。代码块中的标记不会被切分；无法识别的文本会完整保存为
              Unknown Message。
              </p>
            </div>
          )}
        </div> : <p className="text-sm text-zinc-500">Message Timeline 已折叠。Round 是默认阅读与操作入口。</p>}
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">06 · Proposal Workspace</p>
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
            <label className="mb-3 block text-xs font-semibold text-zinc-600">本次 Analyze Provider<select className="ml-2 rounded-lg border border-zinc-200 bg-white px-3 py-2" onChange={(event) => setAnalyzeProviderId(event.target.value)} value={analyzeProviderId}><option value="demo">Demo</option><option value="ollama">Ollama</option><option disabled value="openai">OpenAI（disabled）</option><option disabled value="claude">Claude（disabled）</option></select></label>
            <button
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!source || saveStatus === "editing"}
              onClick={() => runSourceAnalyzer(false)}
              type="button"
            >
              Analyze Source / 生成整理建议
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
            {latestAnalyzerRun.latencyMs !== undefined ? <p className="mt-1 text-xs text-zinc-500">Latency: {latestAnalyzerRun.latencyMs} ms</p> : null}
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
            {(latestAnalyzerRun.status === "failed" || latestAnalyzerRun.status === "timeout") ? <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold" onClick={switchToDemo} type="button">Switch to Demo</button><Link className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold" href="/settings">Increase Timeout</Link></div> : null}
          </div>
        ) : null}
        {analyzerError ? (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>未生成 AI 整理建议：{analyzerError}</p><p className="mt-2">本次失败不写入任何 Proposal 或 Knowledge。</p>
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
          <p className="detail-kicker">07 · Knowledge</p>
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
        </div>
      </div>
    </main>
  );
}
