"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Conversation,
  type ConversationContext,
  type ConversationContextField,
} from "@/core/entities/conversation";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { Task } from "@/core/entities/task";
import {
  ConversationContextService,
  conversationContextLabels,
  getConversationOverviewContext,
} from "@/core/services/conversation-context-service";
import {
  DebouncedAutosave,
  type AutosaveStatus,
} from "@/core/services/debounced-autosave";
import {
  ContextExportService,
  createContinueContextText,
} from "@/core/services/context-export-service";
import { TaskService } from "@/core/services/task-service";
import { RoundKnowledgeService } from "@/core/services/round-knowledge-service";
import { BrowserTaskStorage } from "@/infrastructure/storage/browser-task-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";
import {
  createConversationStorage,
  createConversationVersionStorage,
  createKnowledgeCardStorage,
  createMessageStorage,
  createProposalStorage,
  createRoundStorage,
} from "@/infrastructure/storage/storage-factory";

const contextPlaceholders: Record<ConversationContextField, string> = {
  longTermBackground: "长期目标、稳定偏好、项目背景…",
  currentState: "现在进展到哪里、正在比较或等待什么…",
  decisions: "已经人工确认、后续仍然有效的决定…",
  constraints: "预算、时间、技术、隐私等必须遵守的条件…",
  nextActions: "下次回来从哪里继续；需要状态管理时可创建 Task…",
};

const overviewPrimaryFields: ConversationContextField[] = [
  "longTermBackground",
  "currentState",
  "nextActions",
];

const overviewPrimaryLabels: Partial<
  Record<ConversationContextField, string>
> = {
  longTermBackground: "总备注 / 当前背景",
  currentState: "当前总论",
  nextActions: "后续方向",
};

const autosaveLabels: Record<AutosaveStatus, string> = {
  unchanged: "未修改",
  dirty: "等待保存",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败，点击重试",
};

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function ConversationContextPanel({
  conversation,
  versions,
  onSaved,
}: {
  conversation: Conversation;
  versions: ConversationVersion[];
  onSaved: (
    conversation: Conversation,
    versions: ConversationVersion[],
  ) => void;
}) {
  const initialOverview = getConversationOverviewContext(conversation);
  const [draft, setDraft] = useState<ConversationContext>(initialOverview);
  const [saveStatus, setSaveStatus] =
    useState<AutosaveStatus>("unchanged");
  const [notice, setNotice] = useState<string | null>(null);
  const [nextActionTitle, setNextActionTitle] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);
  const [continueText, setContinueText] = useState("");
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const draftRef = useRef(draft);
  const conversationRef = useRef(conversation);
  const onSavedRef = useRef(onSaved);
  const autosaveRef = useRef<DebouncedAutosave<ConversationContext> | null>(
    null,
  );

  const taskStorage = useMemo(() => new BrowserTaskStorage(), []);
  const workspaceStorage = useMemo(() => new BrowserWorkspaceStorage(), []);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    const autosave = new DebouncedAutosave<ConversationContext>(
      (value) => {
        const versionStorage = createConversationVersionStorage();
        const conversationStorage = createConversationStorage();
        const result = new ConversationContextService({
          conversations: conversationStorage,
          messages: createMessageStorage(),
          versions: versionStorage,
        }).updateContext(conversation.id, value);
        const storedConversation = conversationStorage.getById(conversation.id);

        if (!storedConversation) {
          throw new Error("Conversation no longer exists");
        }

        const savedConversation = result?.conversation ?? storedConversation;
        conversationRef.current = savedConversation;
        onSavedRef.current(
          savedConversation,
          versionStorage.getByConversationId(conversation.id),
        );
      },
      setSaveStatus,
      750,
    );
    autosaveRef.current = autosave;

    const flushBeforeUnload = () => autosave.flush();
    window.addEventListener("beforeunload", flushBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", flushBeforeUnload);
      autosave.dispose();
      if (autosaveRef.current === autosave) autosaveRef.current = null;
    };
  }, [conversation.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTasks(
        new TaskService(taskStorage, workspaceStorage)
          .listByConversation(conversation.id)
          .filter((task) => task.status !== "archived"),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversation.id, taskStorage, workspaceStorage]);

  const timeline = useMemo(
    () =>
      versions
        .filter(
          (version) =>
            version.kind === "context" &&
            Boolean(version.contextChanges?.length),
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [versions],
  );

  function updateField(field: ConversationContextField, value: string) {
    const next = { ...draftRef.current, [field]: value };
    draftRef.current = next;
    setDraft(next);
    setNotice(null);
    autosaveRef.current?.schedule(next);
  }

  function clearContext() {
    autosaveRef.current?.flush();
    if (
      !window.confirm(
        "清空当前 Conversation Context？当前值会被移除，但 Context Timeline 历史会保留。",
      )
    ) {
      return;
    }

    const versionStorage = createConversationVersionStorage();
    const result = new ConversationContextService({
      conversations: createConversationStorage(),
      messages: createMessageStorage(),
      versions: versionStorage,
    }).clearContext(conversation.id);

    if (!result) {
      setNotice("当前没有可清空的 Context。");
      return;
    }

    draftRef.current = {};
    setDraft({});
    setSaveStatus("saved");
    setNotice("当前 Context 已清空；历史 Timeline 保留。");
    setEditorOpen(true);
    onSavedRef.current(
      result.conversation,
      versionStorage.getByConversationId(conversation.id),
    );
  }

  function saveOverviewAsKnowledge() {
    autosaveRef.current?.flush();
    const content = draftRef.current.currentState?.trim();

    if (!content) {
      setNotice("请先填写当前总论。");
      return;
    }

    const currentConversation =
      createConversationStorage().getById(conversation.id) ??
      conversationRef.current;
    const title = `${currentConversation.title} · 当前总论`;
    const confirmed = window.confirm(
      `预览 Knowledge\n\n标题：${title}\n\n内容：${content}\n\n确认后才会创建 Knowledge。`,
    );

    if (!confirmed) return;

    new RoundKnowledgeService(
      createKnowledgeCardStorage(),
      createProposalStorage(),
    ).createConversationManual(currentConversation, title, content);
    setNotice("Conversation Overview 已保存为 Knowledge。");
  }

  function reloadTasks(service: TaskService) {
    setTasks(
      service
        .listByConversation(conversation.id)
        .filter((task) => task.status !== "archived"),
    );
  }

  function createNextAction() {
    const title = nextActionTitle.trim();
    if (!title) return;

    const service = new TaskService(taskStorage, workspaceStorage);
    service.createTask({
      title,
      status: "inbox",
      type: "todo",
      priority: "medium",
      workspaceId: conversation.workspaceId,
      sourceRef: {
        type: "conversation",
        entityId: conversation.id,
        titleSnapshot: conversation.title,
        summarySnapshot:
          conversation.context?.currentState ??
          conversation.summary ??
          conversation.title,
      },
    });
    setNextActionTitle("");
    reloadTasks(service);
  }

  function toggleTask(task: Task) {
    const service = new TaskService(taskStorage, workspaceStorage);
    if (task.status === "completed") {
      service.reopenTask(task.id);
    } else {
      service.completeTask(task.id);
    }
    reloadTasks(service);
  }

  function openContinueContext() {
    autosaveRef.current?.flush();
    const exported = new ContextExportService({
      conversations: createConversationStorage(),
      rounds: createRoundStorage(),
      tasks: taskStorage,
      versions: createConversationVersionStorage(),
    }).exportConversation(conversation.id);

    if (!exported) {
      setCopyNotice("无法生成继续文本，请刷新后重试。");
      return;
    }

    setContinueText(createContinueContextText(exported));
    setContinueOpen(true);
    setCopyNotice(null);
  }

  function copyContinueContext() {
    navigator.clipboard
      .writeText(continueText)
      .then(() => setCopyNotice("继续文本已复制。"))
      .catch(() => {
        window.prompt("复制下面的继续文本：", continueText);
        setCopyNotice("已打开手动复制窗口。");
      });
  }

  return (
    <section
      className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white"
      id="context-overview"
    >
      <div className="border-b border-zinc-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Conversation Overview / 对话总览
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
              属于整个 Conversation 的人工总览，不会被任一 Round 自动覆盖。
            </p>
          </div>
          <button
            className={
              saveStatus === "error"
                ? "rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700"
                : "rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600"
            }
            onClick={() => {
              if (saveStatus === "error") autosaveRef.current?.retry();
            }}
            type="button"
          >
            {autosaveLabels[saveStatus]}
          </button>
        </div>

        <div className="mt-4 grid gap-3 text-sm leading-6 sm:grid-cols-3">
          {overviewPrimaryFields.map((field) => (
            <div className="min-w-0 rounded-lg bg-zinc-50 px-3 py-2" key={field}>
              <p className="text-xs font-semibold text-zinc-500">
                {overviewPrimaryLabels[field]}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-zinc-700">
                {draft[field]?.trim() || "尚未记录"}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            aria-expanded={editorOpen}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            onClick={() => setEditorOpen((current) => !current)}
            type="button"
          >
            {editorOpen ? "收起编辑" : "编辑 Overview"}
          </button>
          <button
            aria-expanded={continueOpen}
            className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-100"
            onClick={openContinueContext}
            type="button"
          >
            继续这个主题
          </button>
          <button
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            onClick={saveOverviewAsKnowledge}
            type="button"
          >
            保存为 Knowledge
          </button>
          <button
            aria-expanded={timelineOpen}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            onClick={() => setTimelineOpen((current) => !current)}
            type="button"
          >
            History / Timeline ({timeline.length})
          </button>
          {notice ? (
            <span className="text-xs font-medium text-zinc-800" role="status">
              {notice}
            </span>
          ) : null}
        </div>
      </div>

      {continueOpen ? (
        <div className="border-b border-sky-100 bg-sky-50/60 p-5" id="continue-context">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-950">继续这个主题</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-600">
                汇总 Conversation Context、最近 3 个 Rounds、Pending Questions 与关联 Next Actions；只做人工查看和复制，不调用 AI。
              </p>
            </div>
            <button
              className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800"
              onClick={copyContinueContext}
              type="button"
            >
              复制继续文本
            </button>
          </div>
          <textarea
            aria-label="继续这个主题文本"
            className="mt-4 min-h-72 w-full rounded-xl border border-sky-200 bg-white p-4 font-mono text-xs leading-6 text-zinc-800"
            onChange={(event) => setContinueText(event.target.value)}
            value={continueText}
          />
          {copyNotice ? (
            <p className="mt-2 text-xs font-medium text-sky-800" role="status">
              {copyNotice}
            </p>
          ) : null}
        </div>
      ) : null}

      {editorOpen ? (
        <div className="border-b border-zinc-200 p-5 sm:p-6" id="context-editor">
          <div>
            <h3 className="text-sm font-semibold text-zinc-950">编辑 Overview</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
              输入停止 750ms 后自动保存，离开输入框时立即保存。
            </p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {overviewPrimaryFields.map((field) => (
              <label
                className="min-w-0 text-sm font-semibold"
                key={field}
              >
                {overviewPrimaryLabels[field]}
                <textarea
                  className="mt-2 min-h-24 w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm font-normal leading-6"
                  data-overview-field={field}
                  onBlur={() => autosaveRef.current?.flush()}
                  onChange={(event) => updateField(field, event.target.value)}
                  placeholder={contextPlaceholders[field]}
                  value={draft[field] ?? ""}
                />
              </label>
            ))}
          </div>
          <details className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
              更多总览（兼容旧决策与约束）
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {(["decisions", "constraints"] as ConversationContextField[]).map(
                (field) => (
                  <label className="min-w-0 text-sm font-semibold" key={field}>
                    {conversationContextLabels[field]}
                    <textarea
                      className="mt-2 min-h-24 w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm font-normal leading-6"
                      data-overview-field={field}
                      onBlur={() => autosaveRef.current?.flush()}
                      onChange={(event) => updateField(field, event.target.value)}
                      placeholder={contextPlaceholders[field]}
                      value={draft[field] ?? ""}
                    />
                  </label>
                ),
              )}
            </div>
          </details>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
              onClick={clearContext}
              type="button"
            >
              清空 Overview
            </button>
            <span className="text-xs text-zinc-500">{autosaveLabels[saveStatus]}</span>
          </div>
        </div>
      ) : null}

      <div className="border-b border-zinc-200 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              Next Actions / 关联 Task
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Context 记录方向；需要完成状态时继续复用 Task，只由用户创建。
            </p>
          </div>
          <Link className="text-xs font-semibold text-sky-700" href="/tasks">
            打开 Tasks →
          </Link>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            onChange={(event) => setNextActionTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") createNextAction();
            }}
            placeholder="例如：完成 v1.7 Release QA"
            value={nextActionTitle}
          />
          <button
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-40"
            disabled={!nextActionTitle.trim()}
            onClick={createNextAction}
            type="button"
          >
            添加 Task
          </button>
        </div>
        {tasks.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {tasks.map((task) => (
              <li
                className="flex items-center gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm"
                key={task.id}
              >
                <input
                  aria-label={`${task.status === "completed" ? "重新打开" : "完成"} ${task.title}`}
                  checked={task.status === "completed"}
                  onChange={() => toggleTask(task)}
                  type="checkbox"
                />
                <span
                  className={
                    task.status === "completed"
                      ? "text-zinc-400 line-through"
                      : "text-zinc-800"
                  }
                >
                  {task.title}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">尚无关联下一步行动。</p>
        )}
      </div>

      {timelineOpen ? (
        <div className="p-5 sm:p-6" id="context-timeline">
          <h3 className="text-sm font-semibold text-zinc-900">
            Context History / Timeline
          </h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            显示什么时候修改了当前状态、决策、约束和下一步；复用 Conversation Version，旧值不会被覆盖。
          </p>
          {timeline.length ? (
            <ol className="mt-4 space-y-3">
              {timeline.map((version) => (
                <li
                  className="rounded-xl border border-zinc-100 bg-zinc-50 p-4"
                  key={version.id}
                >
                  <p className="text-xs font-semibold text-zinc-700">
                    {formatTimestamp(version.createdAt)}
                  </p>
                  <ul className="mt-2 space-y-2 text-xs leading-5 text-zinc-600">
                    {version.contextChanges?.map((change) => (
                      <li className="rounded-lg bg-white px-3 py-2" key={change.field}>
                        <span className="font-semibold text-zinc-800">
                          {conversationContextLabels[change.field]}：
                        </span>
                        {change.previousValue
                          ? `「${change.previousValue}」 → `
                          : "新增 "}
                        {change.nextValue ? `「${change.nextValue}」` : "已清空"}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">
              尚无 Context 变更。首次保存后会生成第一条 Timeline。
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
