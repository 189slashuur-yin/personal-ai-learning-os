"use client";
import { useEffect, useState } from "react";
import { BrowserAssetStorage } from "@/infrastructure/storage/browser-asset-storage";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";
type Finding = { kind: string; id: string; detail: string };
export function DataHealthReport() { const [findings, setFindings] = useState<Finding[] | null>(null); useEffect(() => { const timer = window.setTimeout(() => { const conversations = new BrowserConversationStorage().getAll(); const conversationIds = new Set(conversations.map((item) => item.id)); const rounds = new BrowserRoundStorage().getAll(); const roundIds = new Set(rounds.map((item) => item.id)); const proposals = new BrowserProposalStorage().getAll(); const proposalIds = new Set(proposals.map((item) => item.id)); const knowledge = new BrowserKnowledgeCardStorage().getAll(); const workspaces = new BrowserWorkspaceStorage().getAll(); const workspaceIds = new Set(workspaces.map((item) => item.id)); const entityIds = new Set([...conversationIds, ...roundIds, ...knowledge.map((item) => item.id)]); const next: Finding[] = [];
  proposals.filter((item) => item.conversationId && !conversationIds.has(item.conversationId)).forEach((item) => next.push({ kind: "orphan proposal", id: item.id, detail: "所属 Conversation 已删除或不存在" }));
  knowledge.filter((item) => !proposalIds.has(item.proposalId)).forEach((item) => next.push({ kind: "orphan knowledge", id: item.id, detail: "来源 Proposal 已删除或不存在" }));
  knowledge.filter((item) => item.sourceConversationId && !item.sourceRoundId).forEach((item) => next.push({ kind: "missing sourceRoundId", id: item.id, detail: "旧 Knowledge 或会话级知识，缺少 Round 追溯" }));
  new BrowserAssetStorage().getAll().filter((item) => !entityIds.has(item.entityId)).forEach((item) => next.push({ kind: "orphan asset", id: item.id, detail: `关联 ${item.entityType} 已不存在` }));
  conversations.filter((item) => item.workspaceId && !workspaceIds.has(item.workspaceId)).forEach((item) => next.push({ kind: "invalid folder/workspace", id: item.id, detail: `Workspace ${item.workspaceId} 已删除` }));
  // duplicate import risk: conversations sharing the same externalConversationId
  const duplicateImportRisk = new Map<string, string[]>();
  conversations.filter((item) => item.externalConversationId).forEach((item) => { const key = item.externalConversationId!; if (!duplicateImportRisk.has(key)) duplicateImportRisk.set(key, []); duplicateImportRisk.get(key)!.push(item.id); });
  duplicateImportRisk.forEach((ids, key) => { if (ids.length > 1) next.push({ kind: "duplicate import risk", id: key, detail: `${ids.length} 条 Conversation 共享 externalConversationId: ${key}` }); });
  // orphan rounds: rounds whose conversationId is missing
  rounds.filter((item) => !conversationIds.has(item.conversationId)).forEach((item) => next.push({ kind: "orphan round", id: item.id, detail: "所属 Conversation 已删除" }));
  setFindings(next); }, 0); return () => window.clearTimeout(timer); }, []); if (!findings) return <p className="mt-6">正在检查…</p>; return <><p className="mt-6 rounded-lg bg-sky-50 p-4 text-sm text-sky-800">只读报告：低风险修复将在人工确认后另行执行；本页不会自动改写数据。</p><div className="mt-4 space-y-3">{findings.length ? findings.map((item) => <article className="rounded-lg border border-zinc-200 bg-white p-4" key={`${item.kind}-${item.id}`}><p className="font-semibold">{item.kind}</p><p className="mt-1 text-xs text-zinc-500">{item.id} · {item.detail}</p></article>) : <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">未发现已定义的数据健康问题。</p>}</div></>; }
