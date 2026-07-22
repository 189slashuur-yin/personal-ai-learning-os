import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";
import type { TaskStorage } from "@/core/contracts/task-storage";
import type {
  Conversation,
  ConversationContext,
} from "@/core/entities/conversation";
import type { RoundContext } from "@/core/entities/round";
import type { Task } from "@/core/entities/task";
import {
  getConversationOverviewContext,
  normalizeConversationContext,
} from "@/core/services/conversation-context-service";
import { isTaskLinkedToConversation } from "@/core/services/task-service";

export const PALOS_CONTEXT_EXPORT_FORMAT = "palos-context-export";
export const PALOS_CONTEXT_EXPORT_VERSION = "1.0";

export type PalosContextExport = {
  format: typeof PALOS_CONTEXT_EXPORT_FORMAT;
  version: typeof PALOS_CONTEXT_EXPORT_VERSION;
  exportedAt: string;
  conversation: Omit<Conversation, "context">;
  context: ConversationContext;
  decisions: {
    current?: string;
    history: Array<{
      recordedAt: string;
      previousValue?: string;
      nextValue?: string;
    }>;
  };
  tasks: Task[];
  rounds: Array<{
    id: string;
    order: number;
    title: string;
    summary?: string;
    note?: string;
    context?: RoundContext;
  }>;
};

export type ContextExportStorages = {
  conversations: ConversationStorage;
  rounds: RoundStorage;
  tasks: TaskStorage;
  versions: ConversationVersionStorage;
};

const continueContextLabels: Array<
  [keyof ConversationContext, string]
> = [
  ["longTermBackground", "长期目标 / 背景"],
  ["currentState", "当前状态"],
  ["decisions", "已确认决策"],
  ["constraints", "约束条件"],
  ["nextActions", "下一步方向"],
];

function textOrFallback(value?: string) {
  return value?.trim() || "（未记录）";
}

export function createContinueContextText(
  exported: PalosContextExport,
  recentRoundCount = 3,
) {
  const recentRounds = [...exported.rounds]
    .filter(
      (round) =>
        Boolean(round.summary?.trim()) ||
        Boolean(round.note?.trim()) ||
        Object.values(round.context?.snapshot ?? {}).some((value) =>
          Boolean(value?.trim()),
        ),
    )
    .sort((left, right) => left.order - right.order)
    .slice(-Math.max(0, recentRoundCount));
  const contextLines = continueContextLabels.map(
    ([field, label]) => `- ${label}：${textOrFallback(exported.context[field])}`,
  );
  const roundLines = recentRounds.length
    ? recentRounds.flatMap((round) => [
        `### Round ${round.order} · ${round.title}`,
        `本轮结论：${textOrFallback(round.summary)}`,
        `本轮记录：${textOrFallback(round.note)}`,
        "",
      ])
    : ["（暂无 Round）", ""];
  const taskLines = exported.tasks.length
    ? exported.tasks.map(
        (task) =>
          `- [${task.status === "completed" ? "x" : " "}] ${task.title}`,
      )
    : ["- （暂无关联 Task）"];

  return [
    `# 继续这个主题：${exported.conversation.title}`,
    "",
    "> 以下内容由 PALOS 根据人工维护的数据生成，不包含 AI 推断。",
    "",
    "## Conversation Context",
    ...contextLines,
    "",
    "## 最近 Rounds",
    ...roundLines,
    "## Pending Questions / 未解决问题",
    textOrFallback(exported.conversation.pendingQuestions),
    "",
    "## Next Actions / 下一步行动",
    `- Context：${textOrFallback(exported.context.nextActions)}`,
    ...taskLines,
  ].join("\n");
}

function cloneRoundContext(context?: RoundContext): RoundContext | undefined {
  return context
    ? {
        ...context,
        excludedFields: context.excludedFields
          ? [...context.excludedFields]
          : undefined,
        overrides: context.overrides ? { ...context.overrides } : undefined,
        snapshot: context.snapshot ? { ...context.snapshot } : undefined,
      }
    : undefined;
}

export class ContextExportService {
  constructor(private readonly storages: ContextExportStorages) {}

  exportConversation(conversationId: string): PalosContextExport | null {
    const storedConversation =
      this.storages.conversations.getById(conversationId);

    if (!storedConversation) {
      return null;
    }

    const { context: storedContext, ...conversation } = storedConversation;
    const context = getConversationOverviewContext({
      ...storedConversation,
      context: normalizeConversationContext(storedContext),
    });
    const decisionHistory = this.storages.versions
      .getByConversationId(conversationId)
      .flatMap((version) =>
        (version.contextChanges ?? [])
          .filter((change) => change.field === "decisions")
          .map((change) => ({
            recordedAt: version.createdAt,
            previousValue: change.previousValue,
            nextValue: change.nextValue,
          })),
      )
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
    const tasks = this.storages.tasks
      .getAll()
      .filter((task) => isTaskLinkedToConversation(task, conversationId))
      .map((task) => ({
        ...task,
        sourceRef: task.sourceRef ? { ...task.sourceRef } : undefined,
      }));
    const rounds = this.storages.rounds
      .getByConversationId(conversationId)
      .map((round) => ({
        id: round.id,
        order: round.order,
        title: round.title,
        summary: round.summary,
        note: round.note,
        context: cloneRoundContext(round.context),
      }));

    return {
      format: PALOS_CONTEXT_EXPORT_FORMAT,
      version: PALOS_CONTEXT_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      conversation: { ...conversation },
      context,
      decisions: {
        current: context.decisions,
        history: decisionHistory,
      },
      tasks,
      rounds,
    };
  }
}
