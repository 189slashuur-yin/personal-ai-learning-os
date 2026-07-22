import { describe, expect, it } from "vitest";
import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { TaskStorage } from "@/core/contracts/task-storage";
import type { Conversation } from "@/core/entities/conversation";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import type { Task } from "@/core/entities/task";
import type { Workspace } from "@/core/entities/workspace";
import { ConversationContextService } from "@/core/services/conversation-context-service";
import {
  ContextExportService,
  PALOS_CONTEXT_EXPORT_FORMAT,
  PALOS_CONTEXT_EXPORT_VERSION,
  createContinueContextText,
} from "@/core/services/context-export-service";
import {
  parseRoundRecord,
  serializeRoundRecord,
} from "@/core/services/round-record";
import { RoundContextInheritanceService } from "@/core/services/round-context-inheritance";
import { SearchIndexService } from "@/core/services/search-index-service";
import {
  InMemoryConversationStorage,
  InMemoryMessageStorage,
  InMemoryRoundStorage,
} from "./fakes";

const timestamp = "2026-07-19T00:00:00.000Z";

class InMemoryConversationVersionStorage
  implements ConversationVersionStorage
{
  private versions: ConversationVersion[] = [];

  save(version: ConversationVersion): void {
    if (!this.versions.some((candidate) => candidate.id === version.id)) {
      this.versions.push(structuredClone(version));
    }
  }

  getAll(): ConversationVersion[] {
    return this.versions.map((version) => structuredClone(version));
  }

  getByConversationId(conversationId: string): ConversationVersion[] {
    return this.getAll().filter(
      (version) => version.conversationId === conversationId,
    );
  }

  removeByConversationId(conversationId: string): void {
    this.versions = this.versions.filter(
      (version) => version.conversationId !== conversationId,
    );
  }
}

class InMemoryTaskStorage implements TaskStorage {
  private tasks = new Map<string, Task>();

  save(task: Task): void {
    this.tasks.set(task.id, structuredClone(task));
  }

  getAll(): Task[] {
    return [...this.tasks.values()].map((task) => structuredClone(task));
  }

  getById(id: string): Task | null {
    const task = this.tasks.get(id);
    return task ? structuredClone(task) : null;
  }

  remove(id: string): void {
    this.tasks.delete(id);
  }
}

function conversation(
  id: string,
  fields: Partial<Conversation> = {},
): Conversation {
  return {
    id,
    title: id,
    sourceType: "Manual",
    workspaceId: "inbox",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    ...fields,
  };
}

function round(
  id: string,
  conversationId: string,
  order: number,
  fields: Partial<Round> = {},
): Round {
  return {
    id,
    conversationId,
    order,
    title: `Round ${order}`,
    question: "",
    answer: "",
    messageIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...fields,
  };
}

function createContextHarness(initialConversation: Conversation) {
  const conversations = new InMemoryConversationStorage();
  const messages = new InMemoryMessageStorage();
  const versions = new InMemoryConversationVersionStorage();
  conversations.save(initialConversation);
  const service = new ConversationContextService({
    conversations,
    messages,
    versions,
  });
  return { conversations, messages, versions, service };
}

describe("PALOS v1.7 Conversation Context", () => {
  it("supports create, read, update, and clear while preserving timeline history", () => {
    const harness = createContextHarness(conversation("conversation-context"));

    expect(harness.service.getContext("conversation-context")).toEqual({});

    const created = harness.service.updateContext("conversation-context", {
      longTermBackground: "购买 NAS",
      decisions: "预算 5000",
      constraints: "国产优先",
    });
    expect(created?.conversation.context).toEqual({
      longTermBackground: "购买 NAS",
      decisions: "预算 5000",
      constraints: "国产优先",
    });

    const updated = harness.service.updateContext("conversation-context", {
      longTermBackground: "购买 NAS",
      decisions: "预算提高到 8000",
      constraints: "国产优先",
    });
    expect(updated?.changes).toEqual([
      {
        field: "decisions",
        previousValue: "预算 5000",
        nextValue: "预算提高到 8000",
      },
    ]);
    expect(harness.service.getTimeline("conversation-context")).toHaveLength(2);
    expect(
      harness.service
        .getTimeline("conversation-context")
        .map((version) => version.snapshotData.conversation.context?.decisions),
    ).toEqual(expect.arrayContaining(["预算 5000", "预算提高到 8000"]));

    const cleared = harness.service.clearContext("conversation-context");
    expect(cleared?.conversation.context).toBeUndefined();
    expect(harness.service.getContext("conversation-context")).toEqual({});
    expect(harness.service.getTimeline("conversation-context")).toHaveLength(3);
  });

  it("opens a v1.6.5 Conversation without Context and exports an empty compatible Context", () => {
    const oldConversation = conversation("legacy-v165", {
      summary: "旧摘要",
      conclusion: "旧结论",
    });
    const harness = createContextHarness(oldConversation);
    const rounds = new InMemoryRoundStorage();
    const tasks = new InMemoryTaskStorage();
    const exported = new ContextExportService({
      conversations: harness.conversations,
      rounds,
      tasks,
      versions: harness.versions,
    }).exportConversation(oldConversation.id);

    expect(exported?.format).toBe(PALOS_CONTEXT_EXPORT_FORMAT);
    expect(exported?.version).toBe(PALOS_CONTEXT_EXPORT_VERSION);
    expect(exported?.context).toEqual({});
    expect(exported?.conversation.summary).toBe("旧摘要");
    expect(exported?.conversation.conclusion).toBe("旧结论");
  });
});

describe("PALOS v1.7 Round Context inheritance", () => {
  it("inherits from the selected previous Round and applies manual override/exclude", () => {
    const conversations = new InMemoryConversationStorage();
    const rounds = new InMemoryRoundStorage();
    conversations.save(
      conversation("inheritance", {
        context: {
          longTermBackground: "购买 NAS",
          constraints: "预算 5000",
          nextActions: "比较候选型号",
        },
      }),
    );
    rounds.save(round("round-1", "inheritance", 1));
    rounds.save(round("round-2", "inheritance", 2));
    const service = new RoundContextInheritanceService(conversations, rounds);

    const first = service.confirm("round-1", {
      inheritanceMode: "inherit",
      overrides: { currentState: "比较小米 NAS / 群晖" },
    });
    expect(first?.context?.snapshot).toEqual({
      longTermBackground: "购买 NAS",
      currentState: "比较小米 NAS / 群晖",
      constraints: "预算 5000",
      nextActions: "比较候选型号",
    });
    expect(service.recommendSource("round-2")?.id).toBe("round-1");

    const second = service.confirm("round-2", {
      inheritanceMode: "inherit",
      sourceRoundId: "round-1",
      excludedFields: ["nextActions"],
      overrides: {
        constraints: "预算 8000",
        decisions: "群晖暂缓",
      },
    });
    expect(second?.context?.sourceRoundId).toBe("round-1");
    expect(second?.context?.snapshot).toEqual({
      longTermBackground: "购买 NAS",
      currentState: "比较小米 NAS / 群晖",
      decisions: "群晖暂缓",
      constraints: "预算 8000",
    });
    expect(second?.context?.snapshot?.nextActions).toBeUndefined();
  });

  it("cancels inheritance without deleting local overrides", () => {
    const conversations = new InMemoryConversationStorage();
    const rounds = new InMemoryRoundStorage();
    conversations.save(
      conversation("cancel-inheritance", {
        context: { longTermBackground: "不应进入本轮" },
      }),
    );
    rounds.save(round("round-cancel", "cancel-inheritance", 1));
    const service = new RoundContextInheritanceService(conversations, rounds);

    const cancelled = service.cancelInheritance("round-cancel", {
      currentState: "只保留本轮状态",
    });

    expect(cancelled?.context?.inheritanceMode).toBe("exclude");
    expect(cancelled?.context?.sourceRoundId).toBeUndefined();
    expect(cancelled?.context?.snapshot).toEqual({
      currentState: "只保留本轮状态",
    });
  });
});

describe("PALOS v1.7 Context Export", () => {
  it("exports Conversation, Context, decision history, linked Tasks, and Round summaries", () => {
    const harness = createContextHarness(
      conversation("context-export", { note: "长期项目状态" }),
    );
    harness.service.updateContext("context-export", {
      currentState: "比较方案",
      decisions: "预算 5000",
    });
    harness.service.updateContext("context-export", {
      currentState: "比较方案",
      decisions: "预算 8000",
    });
    const rounds = new InMemoryRoundStorage();
    rounds.save(
      round("export-round", "context-export", 1, {
        summary: "讨论硬盘",
        note: "本轮新增",
        context: {
          inheritanceMode: "inherit",
          snapshot: { currentState: "比较方案" },
          confirmedAt: timestamp,
        },
      }),
    );
    const tasks = new InMemoryTaskStorage();
    tasks.save({
      id: "linked-task",
      title: "查看价格",
      status: "inbox",
      type: "todo",
      priority: "medium",
      workspaceId: "inbox",
      sourceRef: {
        type: "conversation",
        entityId: "context-export",
        titleSnapshot: "context-export",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    tasks.save({
      id: "other-task",
      title: "不应导出",
      status: "inbox",
      type: "todo",
      priority: "medium",
      workspaceId: "inbox",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const exported = new ContextExportService({
      conversations: harness.conversations,
      rounds,
      tasks,
      versions: harness.versions,
    }).exportConversation("context-export");

    expect(exported?.conversation.note).toBe("长期项目状态");
    expect(exported?.context.decisions).toBe("预算 8000");
    expect(exported?.decisions.history).toHaveLength(2);
    expect(exported?.tasks.map((task) => task.id)).toEqual(["linked-task"]);
    expect(exported?.rounds).toEqual([
      expect.objectContaining({
        id: "export-round",
        summary: "讨论硬盘",
        note: "本轮新增",
      }),
    ]);
  });
});

describe("PALOS v1.7 UX refinement", () => {
  it("builds a copyable continue brief from the real PALOS iteration demo", () => {
    const demoConversation = conversation("palos-v17-demo", {
      title: "PALOS开发迭代记录",
      pendingQuestions: "v1.7 是否可以进入 Release QA？",
      context: {
        longTermBackground: "开发个人AI上下文管理工具",
        currentState: "v1.7 UX优化",
        decisions: "暂缓RAG和Agent",
        nextActions: "完成Release QA",
      },
    });
    const conversations = new InMemoryConversationStorage();
    const rounds = new InMemoryRoundStorage();
    const tasks = new InMemoryTaskStorage();
    const versions = new InMemoryConversationVersionStorage();
    conversations.save(demoConversation);
    rounds.save(
      round("palos-round-1", demoConversation.id, 1, {
        title: "重新定义PALOS路线",
        summary: "确认 PALOS 是 Personal AI Context Manager。",
      }),
    );
    rounds.save(
      round("palos-round-2", demoConversation.id, 2, {
        title: "实现Context",
        summary: "完成 Context、inheritance、Timeline 与 Export。",
      }),
    );
    rounds.save(
      round("palos-round-3", demoConversation.id, 3, {
        title: "优化UI",
        summary: "让用户第一眼理解长期状态与继续路径。",
      }),
    );

    const exported = new ContextExportService({
      conversations,
      rounds,
      tasks,
      versions,
    }).exportConversation(demoConversation.id);
    const continueText = createContinueContextText(exported!);

    expect(continueText).toContain("继续这个主题：PALOS开发迭代记录");
    expect(continueText).toContain("当前状态：v1.7 UX优化");
    expect(continueText).toContain("已确认决策：暂缓RAG和Agent");
    expect(continueText).toContain("Round 3 · 优化UI");
    expect(continueText).toContain("v1.7 是否可以进入 Release QA？");
    expect(continueText).toContain("Context：完成Release QA");
  });

  it("stores the five-field Round record in existing Summary and Note fields", () => {
    const stored = serializeRoundRecord({
      goal: "重新确认产品定位",
      conclusion: "PALOS 是 Personal AI Context Manager",
      decisions: "暂缓 RAG 和 Agent",
      pendingQuestions: "Release QA 是否通过？",
      nextActions: "完成真实使用检查",
      additionalNote: "保留原有自由备注",
    });
    const parsed = parseRoundRecord({
      summary: stored.summary,
      note: stored.note,
    });

    expect(stored.summary).toBe("PALOS 是 Personal AI Context Manager");
    expect(stored.note).toContain("【本轮目标】");
    expect(parsed).toEqual({
      notes: "保留原有自由备注",
      goal: "重新确认产品定位",
      conclusion: "PALOS 是 Personal AI Context Manager",
      decisions: "暂缓 RAG 和 Agent",
      pendingQuestions: "Release QA 是否通过？",
      nextActions: "完成真实使用检查",
      legacyNote: "",
    });
  });
});

describe("PALOS v1.7 Search priority", () => {
  it("ranks Context, Summary, Conclusion, Knowledge, Round Note, then Message", () => {
    const keyword = "唯一检索词";
    const conversations = [
      conversation("context-match", {
        context: { currentState: `Context ${keyword}` },
      }),
      conversation("summary-match", { summary: `Summary ${keyword}` }),
      conversation("conclusion-match", {
        conclusion: `Conclusion ${keyword}`,
      }),
      conversation("round-owner"),
      conversation("message-owner"),
      conversation("knowledge-owner"),
    ];
    const rounds: Round[] = [
      round("round-note-match", "round-owner", 1, {
        note: `Round Note ${keyword}`,
      }),
    ];
    const messages: Message[] = [
      {
        id: "message-match",
        conversationId: "message-owner",
        role: "user",
        content: `Message ${keyword}`,
        order: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];
    const knowledgeCards: KnowledgeCard[] = [
      {
        id: "knowledge-match",
        proposalId: "missing-proposal",
        title: "知识记录",
        content: `Knowledge ${keyword}`,
        summary: "",
        sourceFile: "manual",
        sourceConversationId: "knowledge-owner",
        tagIds: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        status: "Active",
      },
    ];
    const workspaces: Workspace[] = [
      {
        id: "inbox",
        name: "Inbox",
        order: 1,
        type: "workspace",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];
    const service = new SearchIndexService({
      workspaces,
      conversations,
      sources: [],
      messages,
      rounds,
      proposals: [],
      knowledgeCards,
      tasks: [],
      tags: [],
      assets: [],
    });

    const results = service.searchDocuments(keyword, {
      entityTypes: ["conversation", "knowledge", "round", "message"],
    });

    expect(results.map((result) => result.entityId)).toEqual([
      "context-match",
      "summary-match",
      "conclusion-match",
      "knowledge-match",
      "round-note-match",
      "message-match",
    ]);
    expect(results[0].matchedFields).toContain("context.currentState");
  });
});
