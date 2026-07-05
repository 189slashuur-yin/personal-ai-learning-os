"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Conversation } from "@/core/entities/conversation";
import { DEFAULT_WORKSPACE_ID, type Workspace } from "@/core/entities/workspace";
import { WorkspaceService } from "@/core/services/workspace-service";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";

type ExplorerItem = {
  conversation: Conversation;
  roundCount: number;
  knowledgeCount: number;
  preview: string;
};

function descendants(workspaces: Workspace[], id: string) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    workspaces.forEach((workspace) => {
      if (workspace.parentId && ids.has(workspace.parentId) && !ids.has(workspace.id)) {
        ids.add(workspace.id);
        changed = true;
      }
    });
  }
  return ids;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function ConversationExplorer({ compact = false }: { compact?: boolean }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [items, setItems] = useState<ExplorerItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"updated" | "manual">("updated");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const conversations = new BrowserConversationStorage().getAll();
      const rounds = new BrowserRoundStorage().getAll();
      const knowledge = new BrowserKnowledgeCardStorage().getAll();
      setWorkspaces(new WorkspaceService(new BrowserWorkspaceStorage(), new BrowserConversationStorage()).listWorkspaces());
      setItems(conversations.map((conversation) => {
        const conversationRounds = rounds.filter((round) => round.conversationId === conversation.id);
        const previewSource = conversationRounds[0]?.question || conversationRounds[0]?.answer || conversation.note || "暂无预览";
        const normalized = previewSource.replace(/\s+/g, " ").trim();
        return {
          conversation,
          roundCount: conversationRounds.length,
          knowledgeCount: knowledge.filter((card) => card.sourceConversationId === conversation.id).length,
          preview: normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized,
        };
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const workspaceDepth = (workspace: Workspace) => {
    let depth = 0;
    let parentId = workspace.parentId;
    while (parentId && depth < 8) {
      depth += 1;
      parentId = workspaces.find((item) => item.id === parentId)?.parentId;
    }
    return depth;
  };
  const visibleItems = useMemo(() => {
    const workspaceIds = selectedId === "all" ? null : descendants(workspaces, selectedId);
    return items
      .filter(({ conversation }) => !workspaceIds || workspaceIds.has(conversation.workspaceId ?? DEFAULT_WORKSPACE_ID))
      .filter(({ conversation, preview }) => `${conversation.title} ${preview}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
      .sort((left, right) => sort === "updated"
        ? right.conversation.updatedAt.localeCompare(left.conversation.updatedAt)
        : (left.conversation.order ?? Number.MAX_SAFE_INTEGER) - (right.conversation.order ?? Number.MAX_SAFE_INTEGER) || left.conversation.title.localeCompare(right.conversation.title));
  }, [items, query, selectedId, sort, workspaces]);
  const recent = [...items].sort((left, right) => right.conversation.lastOpenedAt.localeCompare(left.conversation.lastOpenedAt)).slice(0, 20);

  return <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Conversation Explorer</p><h2 className="mt-2 text-lg font-semibold">对话资源管理器</h2></div><div className="flex gap-2"><input aria-label="搜索当前树下 Conversation" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前树…" value={query} /><select className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm" onChange={(event) => setSort(event.target.value as "updated" | "manual")} value={sort}><option value="updated">按更新时间</option><option value="manual">手动顺序</option></select></div></div>
    <div className={`mt-5 grid gap-5 ${compact ? "lg:grid-cols-[180px_1fr]" : "lg:grid-cols-[240px_1fr]"}`}>
      <aside className="border-r border-zinc-100 pr-4"><button className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${selectedId === "all" ? "bg-zinc-950 text-white" : "text-zinc-700"}`} onClick={() => setSelectedId("all")} type="button">全部</button>{workspaces.filter((workspace) => !workspace.archivedAt).map((workspace) => <button className={`mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm ${selectedId === workspace.id ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-zinc-50"}`} key={workspace.id} onClick={() => setSelectedId(workspace.id)} style={{ paddingLeft: `${12 + workspaceDepth(workspace) * 16}px` }} type="button">{workspace.type === "folder" ? "📁" : "🗂️"} {workspace.name}</button>)}</aside>
      <div><p className="mb-3 text-xs text-zinc-500">{visibleItems.length} 个 Conversation</p><div className="grid gap-3 sm:grid-cols-2">{visibleItems.slice(0, compact ? 8 : undefined).map(({ conversation, roundCount, knowledgeCount, preview }) => <Link className="rounded-xl border border-zinc-200 p-4 hover:border-zinc-400" href={`/conversation/${conversation.id}`} key={conversation.id}><div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-zinc-950">{conversation.title}</h3><span className="text-xs text-zinc-500">{conversation.sourceType}</span></div><p className="mt-2 text-sm leading-6 text-zinc-600">{preview}</p><p className="mt-3 text-xs text-zinc-500">{roundCount} Rounds · {knowledgeCount} Knowledge · {formatDate(conversation.updatedAt)}</p></Link>)}</div></div>
    </div>
    {!compact ? <div className="mt-5 border-t border-zinc-100 pt-4"><p className="text-xs font-semibold text-zinc-500">最近 20 条快捷切换</p><div className="mt-2 flex flex-wrap gap-2">{recent.map(({ conversation }) => <Link className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-200" href={`/conversation/${conversation.id}`} key={conversation.id}>{conversation.title}</Link>)}</div></div> : null}
  </section>;
}
