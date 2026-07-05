"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { DEFAULT_WORKSPACE_ID, type Workspace } from "@/core/entities/workspace";
import { WorkspaceService } from "@/core/services/workspace-service";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserTaskStorage } from "@/infrastructure/storage/browser-task-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";

type TreeItem = { workspace: Workspace; depth: number; conversationCount: number };

function service() {
  return new WorkspaceService(
    new BrowserWorkspaceStorage(),
    new BrowserConversationStorage(),
    new BrowserTaskStorage(),
  );
}

function flattenTree(workspaces: Workspace[], conversationCounts: Map<string, number>) {
  const result: TreeItem[] = [];
  const byParent = new Map<string, Workspace[]>();
  workspaces.forEach((workspace) => {
    const parent = workspace.parentId ?? "root";
    byParent.set(parent, [...(byParent.get(parent) ?? []), workspace]);
  });
  const append = (parentId: string, depth: number) => {
    (byParent.get(parentId) ?? [])
      .sort((left, right) => left.order - right.order)
      .forEach((workspace) => {
        result.push({
          workspace,
          depth,
          conversationCount: conversationCounts.get(workspace.id) ?? 0,
        });
        if (!workspace.collapsed) append(workspace.id, depth + 1);
      });
  };
  append("root", 0);
  return result;
}

export function WorkspaceManager() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [conversationCounts, setConversationCounts] = useState(new Map<string, number>());
  const [filter, setFilter] = useState<"active" | "archived" | "all">("active");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [type, setType] = useState<Workspace["type"]>("workspace");
  const [error, setError] = useState<string | null>(null);

  function reload() {
    const nextWorkspaces = service().listWorkspaces();
    const counts = new Map<string, number>();
    new BrowserConversationStorage().getAll().forEach((conversation) => {
      const workspaceId = conversation.workspaceId ?? DEFAULT_WORKSPACE_ID;
      counts.set(workspaceId, (counts.get(workspaceId) ?? 0) + 1);
    });
    setWorkspaces(nextWorkspaces);
    setConversationCounts(counts);
  }

  useEffect(() => {
    const timer = window.setTimeout(reload, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleTree = useMemo(() => {
    if (!workspaces) return [];
    const visible = workspaces.filter((workspace) =>
      filter === "all" ? true : filter === "archived" ? workspace.archivedAt : !workspace.archivedAt,
    );
    return flattenTree(visible, conversationCounts);
  }, [conversationCounts, filter, workspaces]);

  function createNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      service().createWorkspace({
        name,
        description,
        parentId: parentId || undefined,
        type,
      });
      setName("");
      setDescription("");
      setParentId("");
      setError(null);
      reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法创建 Workspace / Folder。");
    }
  }

  function rename(workspace: Workspace) {
    const nextName = window.prompt("新名称", workspace.name)?.trim();
    if (!nextName) return;
    service().updateWorkspace(workspace.id, { name: nextName });
    reload();
  }

  function remove(workspace: Workspace, conversationCount: number) {
    const fallback = workspace.parentId
      ? workspaces?.find((item) => item.id === workspace.parentId)?.name ?? "Inbox"
      : "Inbox";
    if (!window.confirm(`删除「${workspace.name}」？${conversationCount} 个 Conversation 会移动到 ${fallback}，子 Folder 会提升，不会删除任何 Conversation。`)) return;
    service().deleteWorkspace(workspace.id);
    reload();
  }

  function exportWorkspaceBundle() { if (!workspaces) return; const conversations = new BrowserConversationStorage().getAll(); const bundle = { workspaces, conversations: conversations.filter((conversation) => workspaces.some((workspace) => workspace.id === conversation.workspaceId)), exportedAt: new Date().toISOString() }; const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "palos-workspace-folder-bundle.json"; link.click(); URL.revokeObjectURL(link.href); }

  if (!workspaces) return <p className="mt-10 text-sm text-zinc-500">正在读取 Workspace 树…</p>;

  return (
    <>
      <form className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm" onSubmit={createNode}>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Hierarchy Workspace</p>
        <h2 className="mt-2 text-lg font-semibold text-zinc-950">创建 Workspace / Folder</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-zinc-700">名称<input className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5" onChange={(event) => setName(event.target.value)} value={name} /></label>
          <label className="text-sm font-medium text-zinc-700">类型<select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setType(event.target.value as Workspace["type"])} value={type}><option value="workspace">Workspace</option><option value="folder">Folder</option></select></label>
          <label className="text-sm font-medium text-zinc-700">上级<select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setParentId(event.target.value)} value={parentId}><option value="">顶层</option>{workspaces.filter((workspace) => !workspace.archivedAt && workspace.id !== DEFAULT_WORKSPACE_ID).map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
          <label className="text-sm font-medium text-zinc-700">描述<input className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5" onChange={(event) => setDescription(event.target.value)} value={description} /></label>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <button className="mt-5 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white" type="submit">创建</button>
      </form>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">{(["active", "archived", "all"] as const).map((value) => <button className={`rounded-lg px-3 py-2 text-sm ${filter === value ? "bg-zinc-950 text-white" : "bg-white text-zinc-600"}`} key={value} onClick={() => setFilter(value)} type="button">{value}</button>)}</div>
        <div className="flex items-center gap-3"><button className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold" onClick={exportWorkspaceBundle} type="button">Export Workspace/Folder JSON</button><p className="text-xs text-zinc-500">手动排序先用上移 / 下移；未来可接拖拽。</p></div>
      </div>

      <div className="mt-4 grid gap-3">
        {visibleTree.map(({ workspace, depth, conversationCount }) => (
          <article className="rounded-xl border border-zinc-200 bg-white p-4" key={workspace.id} style={{ marginLeft: `${Math.min(depth, 5) * 20}px` }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button className="min-w-0 text-left" disabled={workspace.id === DEFAULT_WORKSPACE_ID} onClick={() => { service().updateWorkspace(workspace.id, { collapsed: !workspace.collapsed }); reload(); }} type="button">
                <span className="mr-2 text-zinc-400">{workspace.collapsed ? "▸" : "▾"}</span>
                <span className="font-semibold text-zinc-950">{workspace.type === "folder" ? "📁" : "🗂️"} {workspace.name}</span>
                <span className="ml-3 text-xs text-zinc-500">{conversationCount} Conversation{workspace.archivedAt ? " · Archived" : ""}</span>
              </button>
              {workspace.id !== DEFAULT_WORKSPACE_ID ? <div className="flex flex-wrap items-center gap-2 text-xs">
                <button onClick={() => rename(workspace)} type="button">重命名</button>
                <button onClick={() => { service().reorderWorkspace(workspace.id, "up"); reload(); }} type="button">上移</button>
                <button onClick={() => { service().reorderWorkspace(workspace.id, "down"); reload(); }} type="button">下移</button>
                <select aria-label={`移动 ${workspace.name}`} className="rounded border border-zinc-200 bg-white px-2 py-1" onChange={(event) => { service().moveWorkspace(workspace.id, event.target.value || undefined); reload(); }} value={workspace.parentId ?? ""}><option value="">移动到顶层</option>{workspaces.filter((candidate) => candidate.id !== workspace.id && candidate.id !== DEFAULT_WORKSPACE_ID && !candidate.archivedAt).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>
                {workspace.archivedAt ? <button onClick={() => { service().restoreWorkspace(workspace.id); reload(); }} type="button">恢复</button> : <button onClick={() => { service().archiveWorkspace(workspace.id); reload(); }} type="button">归档</button>}
                <button className="text-red-600" onClick={() => remove(workspace, conversationCount)} type="button">删除</button>
              </div> : <span className="text-xs text-zinc-500">默认归属，不可删除</span>}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
