"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Conversation } from "@/core/entities/conversation";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Tag } from "@/core/entities/tag";
import type { Workspace } from "@/core/entities/workspace";
import { ProviderService } from "@/core/services/provider-service";
import { ProviderConfigurationService } from "@/core/services/provider-configuration-service";
import { WorkspaceService } from "@/core/services/workspace-service";
import { TaskService } from "@/core/services/task-service";
import { BrowserAIProviderStorage } from "@/infrastructure/storage/browser-ai-provider-storage";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserPromptTemplateStorage } from "@/infrastructure/storage/browser-prompt-template-storage";
import { BrowserProviderConfigurationStorage } from "@/infrastructure/storage/browser-provider-configuration-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserTagStorage } from "@/infrastructure/storage/browser-tag-storage";
import { BrowserTaskStorage } from "@/infrastructure/storage/browser-task-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";
import { BrowserAnalyzerRunStorage } from "@/infrastructure/storage/browser-analyzer-run-storage";

type DashboardData = {
  conversationCount: number;
  knowledgeCount: number;
  messageCount: number;
  messageCountsByConversation: Record<string, number>;
  proposalCount: number;
  tagCount: number;
  taskCount: number;
  todayTaskCount: number;
  workspaceCount: number;
  recentWorkspaces: Array<{ workspace: Workspace; conversationCount: number }>;
  recentConversations: Array<{ conversation: Conversation; preview: string }>;
  recentImports: Array<{
    conversation: Conversation;
    source: ImportedSource;
    messageCount: number;
  }>;
  recentKnowledge: KnowledgeCard[];
  recentTags: Tag[];
  latestUpdatedAt: string | null;
  latestOpenedAt: string | null;
  providerName: string;
  providerLastTest: string;
  recentAnalyzeProvider: string;
};

function formatDashboardTime(timestamp: string | null) {
  if (!timestamp) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function conversationPreview(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 60 ? `${normalized.slice(0, 59)}…` : normalized;
}

export function DashboardOverview() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const conversations = new BrowserConversationStorage().getAll();
      const taskService = new TaskService(
        new BrowserTaskStorage(),
        new BrowserWorkspaceStorage(),
      );
      const workspaces = new WorkspaceService(
        new BrowserWorkspaceStorage(),
        new BrowserConversationStorage(),
      ).listWorkspaces();
      const activeKnowledge = new BrowserKnowledgeCardStorage()
        .getAll()
        .filter((card) => card.status === "Active")
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      const recentConversations = [...conversations].sort(
        (left, right) =>
          new Date(right.lastOpenedAt).getTime() -
          new Date(left.lastOpenedAt).getTime(),
      );
      const messages = new BrowserMessageStorage().getAll();
      const tags = new BrowserTagStorage()
        .getAll()
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      const messageCountsByConversation = messages.reduce<Record<string, number>>(
        (counts, message) => {
          counts[message.conversationId] =
            (counts[message.conversationId] ?? 0) + 1;
          return counts;
        },
        {},
      );
      const sourceStorage = new BrowserSourceStorage();
      const recentImports = [...conversations]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .flatMap((conversation) => {
          const source = sourceStorage.getByConversationId(conversation.id);

          return source
            ? [
                {
                  conversation,
                  source,
                  messageCount:
                    messageCountsByConversation[conversation.id] ?? 0,
                },
              ]
            : [];
        })
        .slice(0, 5);
      const providerService = new ProviderService(
        new BrowserAIProviderStorage(),
        new BrowserProviderConfigurationStorage(),
        new BrowserPromptTemplateStorage(),
      );
      const currentProvider = providerService.getCurrentProvider();
      const providerConfiguration = new ProviderConfigurationService(
        new BrowserProviderConfigurationStorage(),
      )
        .listConfigurations()
        .find(
          (configuration) =>
            configuration.providerId === currentProvider.providerInfo.id,
        );

      setData({
        conversationCount: conversations.length,
        knowledgeCount: activeKnowledge.length,
        messageCount: messages.length,
        messageCountsByConversation,
        proposalCount: new BrowserProposalStorage().getAll().length,
        tagCount: tags.length,
        taskCount: taskService.listTasks().length,
        todayTaskCount: taskService.listToday().length,
        workspaceCount: workspaces.length,
        recentWorkspaces: workspaces
          .filter((workspace) => !workspace.archivedAt)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, 4)
          .map((workspace) => ({
            workspace,
            conversationCount: conversations.filter(
              (conversation) => conversation.workspaceId === workspace.id,
            ).length,
          })),
        recentConversations: recentConversations.slice(0, 8).map((conversation) => {
          const source = sourceStorage.getByConversationId(conversation.id);
          const firstMessage = messages
            .filter((message) => message.conversationId === conversation.id)
            .sort((left, right) => left.order - right.order)[0];
          return {
            conversation,
            preview: conversationPreview(source?.content ?? firstMessage?.content ?? "暂无原文或 Message 摘要"),
          };
        }),
        recentImports,
        recentKnowledge: activeKnowledge.slice(0, 4),
        recentTags: tags.slice(0, 6),
        latestUpdatedAt:
          conversations
            .map((conversation) => conversation.updatedAt)
            .sort((left, right) => right.localeCompare(left))[0] ?? null,
        latestOpenedAt: recentConversations[0]?.lastOpenedAt ?? null,
        providerName: currentProvider.providerInfo.name,
        providerLastTest: providerConfiguration?.lastTestTime
          ? `${providerConfiguration.lastTestStatus} · ${formatDashboardTime(providerConfiguration.lastTestTime)}`
          : (providerConfiguration?.lastTestStatus ?? "Never Tested"),
        recentAnalyzeProvider: new BrowserAnalyzerRunStorage().getLatest()?.providerName ?? "—",
      });
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  if (!data) {
    return (
      <p className="mt-10 text-sm text-zinc-500" role="status">
        正在读取工作区…
      </p>
    );
  }

  const stats = [
    { label: "当前 Provider", value: data.providerName },
    { label: "Last Test", value: data.providerLastTest },
    { label: "最近 Analyze Provider", value: data.recentAnalyzeProvider },
    { label: "Conversation", value: data.conversationCount },
    { label: "Workspace", value: data.workspaceCount },
    { label: "Messages", value: data.messageCount },
    { label: "Knowledge", value: data.knowledgeCount },
    { label: "Proposal", value: data.proposalCount },
    { label: "Tags", value: data.tagCount },
    { label: "Tasks", value: data.taskCount },
    { label: "Today Tasks", value: data.todayTaskCount },
    { label: "最近更新时间", value: formatDashboardTime(data.latestUpdatedAt) },
    { label: "最后打开时间", value: formatDashboardTime(data.latestOpenedAt) },
  ];

  return (
    <>
      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
            key={stat.label}
          >
            <p className="text-sm font-medium text-zinc-500">{stat.label}</p>
            <p className="mt-3 text-xl font-semibold tracking-tight text-zinc-950 lg:text-2xl">
              {stat.value}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Daily Focus</p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-950">Today</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {data.todayTaskCount} 个今天或已逾期的未完成 Task。
            </p>
          </div>
          <Link className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800" href="/today">
            打开 Today →
          </Link>
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Workspace Recent</p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-950">最近 Workspace</h2>
          </div>
          <Link className="text-sm font-medium text-zinc-600 hover:text-zinc-950" href="/workspace">管理 Workspace →</Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.recentWorkspaces.map(({ workspace, conversationCount }) => (
            <Link className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50" href={`/conversation?workspace=${encodeURIComponent(workspace.id)}`} key={workspace.id}>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-zinc-300" style={workspace.color ? { backgroundColor: workspace.color } : undefined} />
                <p className="truncate font-medium text-zinc-900">{workspace.name}</p>
              </div>
              <p className="mt-2 text-xs text-zinc-500">{conversationCount} Conversation · 更新 {formatDashboardTime(workspace.updatedAt)}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Tags Recent</p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-950">最近 Tags</h2>
          </div>
          <Link className="text-sm font-medium text-zinc-600 hover:text-zinc-950" href="/tags">
            管理 Tags →
          </Link>
        </div>
        {data.recentTags.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.recentTags.map((tag) => (
              <span
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700"
                key={tag.id}
                style={tag.color ? { borderColor: tag.color } : undefined}
              >
                {tag.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">尚无 Tag，可在 Tag 管理页或 Knowledge Detail 中新建。</p>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Recent Imports</p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">最近导入</h2>
          </div>
          <Link className="text-sm font-medium text-zinc-600 hover:text-zinc-950" href="/import">
            新建导入 →
          </Link>
        </div>
        {data.recentImports.length ? (
          <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {data.recentImports.map(({ conversation, source, messageCount }, index) => (
              <Link
                className={`flex items-center justify-between gap-4 px-5 py-4 hover:bg-zinc-50 ${index > 0 ? "border-t border-zinc-100" : ""}`}
                href={`/conversation/${conversation.id}`}
                key={conversation.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">{conversation.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    sourceType：{conversation.sourceType} · message count：{messageCount} · {source.content.length} 字符 · 创建 {formatDashboardTime(conversation.createdAt)}
                  </p>
                </div>
                <span className="text-sm text-zinc-400">→</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
            尚无导入记录。
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Recent</p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">
              最近 Conversation
            </h2>
          </div>
          <Link
            className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
            href="/conversation"
          >
            查看全部 →
          </Link>
        </div>

        {data.recentConversations.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
            <p className="text-sm text-zinc-500">
              暂无 Conversation，请先从 Import 导入内容。
            </p>
            <Link
              className="mt-4 inline-block rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white"
              href="/import"
            >
              前往 Import
            </Link>
          </div>
        ) : (
          <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
            {data.recentConversations.map(({ conversation, preview }) => (
              <Link
                className="group min-w-64 max-w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-400 hover:shadow-md"
                href={`/conversation/${conversation.id}`}
                key={conversation.id}
                title={preview}
              >
                <p className="truncate font-semibold text-zinc-900 group-hover:text-zinc-950">{conversation.title}</p>
                <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-zinc-500">{preview}</p>
                <p className="mt-3 text-[11px] text-zinc-400">
                  {data.messageCountsByConversation[conversation.id] ?? 0} Messages · {formatDashboardTime(conversation.lastOpenedAt)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Knowledge Recent</p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">最近知识</h2>
          </div>
          <Link className="text-sm font-medium text-zinc-600 hover:text-zinc-950" href="/knowledge">
            查看全部 →
          </Link>
        </div>

        {data.recentKnowledge.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
            暂无 Active Knowledge。
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {data.recentKnowledge.map((card) => (
              <Link className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-zinc-300 hover:shadow-md" href={`/knowledge/${card.id}`} key={card.id}>
                <h3 className="truncate font-medium text-zinc-950">{card.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">{card.content}</p>
                <p className="mt-4 truncate border-t border-zinc-100 pt-3 text-xs text-zinc-500">{card.sourceFile}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
