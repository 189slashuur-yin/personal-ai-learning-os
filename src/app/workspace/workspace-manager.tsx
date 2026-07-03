"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import type { Conversation } from "@/core/entities/conversation";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";
import {
  DEFAULT_WORKSPACE_ID,
  type Workspace,
} from "@/core/entities/workspace";
import { WorkspaceService } from "@/core/services/workspace-service";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";

type WorkspaceItem = {
  workspace: Workspace;
  conversationCount: number;
  knowledgeCount: number;
};

function createWorkspaceService() {
  return new WorkspaceService(
    new BrowserWorkspaceStorage(),
    new BrowserConversationStorage(),
  );
}

function resolveKnowledgeWorkspaceId(
  card: KnowledgeCard,
  proposalById: Map<string, Proposal>,
  conversationById: Map<string, Conversation>,
) {
  const proposal = proposalById.get(card.proposalId);
  const conversationId = card.sourceConversationId ?? proposal?.conversationId;
  return conversationId
    ? conversationById.get(conversationId)?.workspaceId ?? DEFAULT_WORKSPACE_ID
    : null;
}

function loadWorkspaceItems(): WorkspaceItem[] {
  const workspaces = createWorkspaceService().listWorkspaces();
  const conversations = new BrowserConversationStorage().getAll();
  const proposals = new BrowserProposalStorage().getAll();
  const knowledgeCards = new BrowserKnowledgeCardStorage().getAll();
  const conversationById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );
  const proposalById = new Map(
    proposals.map((proposal) => [proposal.id, proposal]),
  );

  return workspaces.map((workspace) => ({
    workspace,
    conversationCount: conversations.filter(
      (conversation) =>
        (conversation.workspaceId ?? DEFAULT_WORKSPACE_ID) === workspace.id,
    ).length,
    knowledgeCount: knowledgeCards.filter(
      (card) =>
        resolveKnowledgeWorkspaceId(
          card,
          proposalById,
          conversationById,
        ) === workspace.id,
    ).length,
  }));
}

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function WorkspaceCard({
  item,
  onChange,
}: {
  item: WorkspaceItem;
  onChange: () => void;
}) {
  const { workspace, conversationCount, knowledgeCount } = item;
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description ?? "");
  const [color, setColor] = useState(workspace.color ?? "#71717a");
  const [error, setError] = useState<string | null>(null);
  const isInbox = workspace.id === DEFAULT_WORKSPACE_ID;

  function saveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      createWorkspaceService().updateWorkspace(workspace.id, {
        name,
        description,
        color,
      });
      setError(null);
      onChange();
    } catch {
      setError("Workspace 名称不能为空。");
    }
  }

  function archiveWorkspace() {
    createWorkspaceService().archiveWorkspace(workspace.id);
    onChange();
  }

  function restoreWorkspace() {
    createWorkspaceService().restoreWorkspace(workspace.id);
    onChange();
  }

  function deleteWorkspace() {
    const firstConfirmed = window.confirm(
      `删除「${workspace.name}」？其中 ${conversationCount} 个 Conversation 不会删除，会自动回到 Inbox。`,
    );

    if (!firstConfirmed) {
      return;
    }

    const secondConfirmed = window.confirm(
      "请再次确认：Workspace 本身会永久删除，此操作无法撤销。",
    );

    if (!secondConfirmed) {
      return;
    }

    createWorkspaceService().deleteWorkspace(workspace.id);
    onChange();
  }

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="h-4 w-4 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: workspace.color ?? "#d4d4d8" }}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-semibold text-zinc-950">
                {workspace.name}
              </h2>
              {isInbox ? (
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                  Default
                </span>
              ) : workspace.archivedAt ? (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
                  Archived
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              更新于 {formatDate(workspace.updatedAt)}
            </p>
          </div>
        </div>
        <div className="text-right text-sm text-zinc-600">
          <div className="flex gap-4">
            <span><strong className="text-zinc-950">{conversationCount}</strong> Conversation</span>
            <span><strong className="text-zinc-950">{knowledgeCount}</strong> Knowledge</span>
          </div>
          <Link
            className="mt-2 inline-block text-xs font-semibold text-zinc-600 hover:text-zinc-950"
            href={`/search?workspaceId=${encodeURIComponent(workspace.id)}`}
          >
            搜索此 Workspace →
          </Link>
        </div>
      </div>

      <form className="mt-5 grid gap-4 border-t border-zinc-100 pt-5" onSubmit={saveWorkspace}>
        <label className="text-sm font-medium text-zinc-700">
          名称
          <input
            className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <label className="text-sm font-medium text-zinc-700">
          描述
          <textarea
            className="mt-2 min-h-20 w-full resize-y rounded-lg border border-zinc-300 px-3 py-2.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="这个 Workspace 用来整理什么？"
            value={description}
          />
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-zinc-700">
          颜色
          <input
            aria-label={`${workspace.name} 颜色`}
            className="h-9 w-14 rounded border border-zinc-300 bg-white p-1"
            onChange={(event) => setColor(event.target.value)}
            type="color"
            value={color}
          />
          <span className="font-mono text-xs font-normal text-zinc-500">{color}</span>
        </label>
        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            type="submit"
          >
            保存修改
          </button>
          {!isInbox ? (
            <div className="flex gap-3">
              {workspace.archivedAt ? (
                <button className="text-sm font-medium text-emerald-700 hover:text-emerald-900" onClick={restoreWorkspace} type="button">
                  Restore
                </button>
              ) : (
                <button className="text-sm font-medium text-zinc-600 hover:text-zinc-950" onClick={archiveWorkspace} type="button">
                  Archive
                </button>
              )}
              <button className="text-sm font-medium text-red-600 hover:text-red-800" onClick={deleteWorkspace} type="button">
                Delete
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Inbox 不可归档或删除。</p>
          )}
        </div>
      </form>
    </article>
  );
}

export function WorkspaceManager() {
  const [items, setItems] = useState<WorkspaceItem[] | null>(null);
  const [filter, setFilter] = useState<"Active" | "Archived" | "All">("Active");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setItems(loadWorkspaceItems());
  }

  useEffect(() => {
    const timer = window.setTimeout(reload, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      createWorkspaceService().createWorkspace({ name, description, color });
      setName("");
      setDescription("");
      setError(null);
      reload();
    } catch {
      setError("Workspace 名称不能为空。");
    }
  }

  if (!items) {
    return <p className="mt-10 text-sm text-zinc-500" role="status">正在读取 Workspace…</p>;
  }

  const visibleItems = items.filter(({ workspace }) => {
    if (filter === "All") return true;
    if (filter === "Archived") return Boolean(workspace.archivedAt);
    return !workspace.archivedAt;
  });

  return (
    <>
      <form className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm" onSubmit={createWorkspace}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">New Workspace</p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-950">创建学习空间</h2>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
          <label className="text-sm font-medium text-zinc-700">
            名称
            <input className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5 outline-none focus:border-zinc-500" onChange={(event) => setName(event.target.value)} placeholder="例如：产品研究" value={name} />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            描述
            <input className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5 outline-none focus:border-zinc-500" onChange={(event) => setDescription(event.target.value)} placeholder="可选" value={description} />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            颜色
            <input className="mt-2 block h-11 w-16 rounded border border-zinc-300 bg-white p-1" onChange={(event) => setColor(event.target.value)} type="color" value={color} />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600" role="alert">{error}</p> : null}
        <button className="mt-5 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800" type="submit">
          创建 Workspace
        </button>
      </form>

      <div className="mt-8 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">所有 Workspace</h2>
          <div className="mt-3 flex rounded-lg bg-zinc-200/70 p-1">
            {(["Active", "Archived", "All"] as const).map((item) => (
              <button className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === item ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600"}`} key={item} onClick={() => setFilter(item)} type="button">{item}</button>
            ))}
          </div>
        </div>
        <p className="text-sm text-zinc-500">{visibleItems.length} 个</p>
      </div>
      {visibleItems.length ? (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {visibleItems.map((item) => (
            <WorkspaceCard item={item} key={item.workspace.id} onChange={reload} />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <h3 className="font-semibold text-zinc-950">此筛选下没有 Workspace</h3>
          <p className="mt-2 text-sm text-zinc-500">创建新 Workspace，或切换 Active / Archived / All 查看其它空间。</p>
        </div>
      )}
    </>
  );
}
