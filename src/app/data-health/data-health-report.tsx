"use client";
import { useEffect, useState } from "react";
import { BrowserAssetStorage } from "@/infrastructure/storage/browser-asset-storage";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
type Finding = { kind: string; id: string; detail: string };

function estimateLocalStorageUsage(): { totalBytes: number; keyCount: number } {
  let totalBytes = 0;
  let keyCount = 0;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    const value = window.localStorage.getItem(key) ?? "";
    totalBytes += key.length + value.length; // UTF-16 → ~2 bytes per char
    keyCount += 1;
  }
  return { totalBytes, keyCount };
}

export function DataHealthReport() {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ totalBytes: number; keyCount: number } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const conversations = new BrowserConversationStorage().getAll();
      const conversationIds = new Set(conversations.map((item) => item.id));
      const rounds = new BrowserRoundStorage().getAll();
      const roundIds = new Set(rounds.map((item) => item.id));
      const proposals = new BrowserProposalStorage().getAll();
      const proposalIds = new Set(proposals.map((item) => item.id));
      const knowledge = new BrowserKnowledgeCardStorage().getAll();
      const workspaces = new BrowserWorkspaceStorage().getAll();
      const workspaceIds = new Set(workspaces.map((item) => item.id));
      const entityIds = new Set([...conversationIds, ...roundIds, ...knowledge.map((item) => item.id)]);
      const next: Finding[] = [];
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
      // P0-9: Empty conversations (0 messages / 0 rounds)
      const messages = new BrowserMessageStorage().getAll();
      const messagesByConv = new Map<string, number>();
      messages.forEach((m) => messagesByConv.set(m.conversationId, (messagesByConv.get(m.conversationId) ?? 0) + 1));
      const roundCountByConv = new Map<string, number>();
      rounds.forEach((r) => roundCountByConv.set(r.conversationId, (roundCountByConv.get(r.conversationId) ?? 0) + 1));
      conversations.forEach((conv) => {
        const msgCount = messagesByConv.get(conv.id) ?? 0;
        const rndCount = roundCountByConv.get(conv.id) ?? 0;
        if (msgCount === 0 || rndCount === 0) {
          next.push({ kind: "empty conversation", id: conv.id, detail: `「${conv.title}」: ${msgCount} Messages · ${rndCount} Rounds${conv.externalSource === "chatgpt" ? " (imported)" : ""}` });
        }
      });
      setFindings(next);

      // P0-9: Estimate localStorage usage
      try {
        setStorageUsage(estimateLocalStorageUsage());
      } catch {
        setStorageUsage(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!findings) return <p className="mt-6">正在检查…</p>;

  const emptyCount = findings.filter((f) => f.kind === "empty conversation").length;
  const orphanCount = findings.filter((f) => f.kind.startsWith("orphan")).length;

  const storageMB = storageUsage ? (storageUsage.totalBytes / (1024 * 1024)).toFixed(1) : null;

  return (
    <>
      {/* P0-9: Storage strategy overview */}
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-950">💾 存储策略 — LocalStorage</h2>
        <div className="mt-3 space-y-2 text-sm leading-7 text-amber-900">
          <p>
            当前版本使用<strong>浏览器 LocalStorage</strong> 存储所有数据。
            LocalStorage 适合小批量/个人试用场景，<strong>不适合一次性导入几十 MB 的大文件</strong>。
          </p>
          {storageUsage ? (
            <div className="mt-3 rounded-lg bg-white p-3">
              <p className="text-sm font-semibold text-zinc-800">
                当前 LocalStorage 用量估算
              </p>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-600">
                <span>
                  <strong>预估大小：</strong>~{storageMB} MB（{storageUsage.totalBytes.toLocaleString()} 字节）
                </span>
                <span>
                  <strong>存储键数：</strong>{storageUsage.keyCount}
                </span>
                <span>
                  <strong>Conversation 数：</strong>{findings ? new BrowserConversationStorage().getAll().length : "—"}
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                注：LocalStorage 通常限制为 5–10 MB，不同浏览器策略不同。以上按 UTF-16 编码估算，实际序列化后可能略有差异。
              </p>
            </div>
          ) : null}
          <p className="font-semibold mt-3">推荐策略：</p>
          <ul className="list-inside list-disc space-y-1">
            <li>每次导入少量重要对话（建议单次不超过 3000 条 Message 或 200 万字符）</li>
            <li>先清理 0 Message / 0 Round 的失败对话（当前检测到 {emptyCount} 个）</li>
            <li>在 Conversation 页面使用 Empty 筛选，一键选择并批量删除</li>
            <li>如导入被中断，减少选择数量后分批导入</li>
          </ul>
          <p className="mt-2 text-xs text-amber-700">
            后续版本计划迁移到 <strong>IndexedDB</strong>，届时将支持更大规模的本地数据存储。本轮不实现 IndexedDB、服务器存储或本地目录长期读取。
          </p>
        </div>
      </div>

      <p className="mt-6 rounded-lg bg-sky-50 p-4 text-sm text-sky-800">
        只读报告：低风险修复将在人工确认后另行执行；本页不会自动改写数据。
      </p>

      {/* Findings summary */}
      {findings.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
            {orphanCount} 孤立数据
          </span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
            {emptyCount} 空 Conversation
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-600">
            {findings.length} 总计发现
          </span>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {findings.length ? (
          findings.map((item) => (
            <article
              className={`rounded-lg border p-4 ${
                item.kind === "empty conversation"
                  ? "border-amber-200 bg-amber-50"
                  : "border-zinc-200 bg-white"
              }`}
              key={`${item.kind}-${item.id}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{item.kind}</p>
                {item.kind === "empty conversation" ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                    建议清理
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {item.id} · {item.detail}
              </p>
            </article>
          ))
        ) : (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            未发现已定义的数据健康问题。
          </p>
        )}
      </div>
    </>
  );
}
